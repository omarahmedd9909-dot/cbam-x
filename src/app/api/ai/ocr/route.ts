import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { withAuth, badRequest, notFound } from '@/lib/auth';
import { recordUsage } from '@/lib/billing/stripe';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const OCR_SYSTEM_PROMPT = `You are a CBAM compliance data extraction specialist.
Your job is to extract structured data from uploaded documents for EU Carbon Border Adjustment Mechanism compliance.

Extract the following fields if present (return null if absent):
- document_type: one of invoice, supplier_declaration, customs_document, electricity_bill, production_report, lab_certificate
- period: YYYY-Qx format (e.g. "2025-Q1")
- supplier_name: company name
- supplier_country: ISO-2 country code if discernible
- product_names: array of product names
- cn_codes: array of CN codes found (8-digit)
- production_volume: number with unit (e.g. {"value": 1200, "unit": "t"})
- direct_emissions: tCO2e value if stated
- indirect_emissions: tCO2e value if stated
- electricity_consumption: MWh value if stated
- fuel_type: fuel used (natural_gas, coal, etc.)
- fuel_consumption: value with unit
- invoice_date: ISO date
- invoice_number: string
- total_value: {amount, currency}

Return ONLY a JSON object with these fields. No explanation, no markdown fences.
For each extracted value also return a confidence score (0-100).
Format: {"field": {"value": ..., "confidence": 0-100, "source_text": "..."}}`;

export const POST = withAuth(async (request: NextRequest, ctx) => {
  const body = await request.json();
  const { document_id } = body;

  if (!document_id) return badRequest('document_id is required');

  // Fetch document
  const { data: doc } = await ctx.supabase
    .from('documents')
    .select('id, storage_path, filename, mime_type, ocr_status')
    .eq('id', document_id)
    .eq('org_id', ctx.orgId)
    .single();

  if (!doc) return notFound('Document');
  if (doc.ocr_status === 'processing') {
    return NextResponse.json({ error: { code: 'ALREADY_PROCESSING', message: 'OCR already in progress' } }, { status: 409 });
  }

  // Mark as processing
  await ctx.supabase
    .from('documents')
    .update({ ocr_status: 'processing' })
    .eq('id', document_id);

  try {
    // Download file from Supabase Storage
    const { data: fileData, error: storageError } = await ctx.supabase.storage
      .from('documents')
      .download(doc.storage_path);

    if (storageError || !fileData) {
      throw new Error(`Storage download failed: ${storageError?.message}`);
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    // Determine media type
    const mediaType = (doc.mime_type ?? 'application/pdf') as
      | 'application/pdf'
      | 'image/jpeg'
      | 'image/png'
      | 'image/webp';

    const isPdf = mediaType === 'application/pdf';

    // Call Claude for extraction
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: OCR_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            isPdf
              ? {
                  type: 'document' as const,
                  source: {
                    type: 'base64' as const,
                    media_type: 'application/pdf' as const,
                    data: base64,
                  },
                }
              : {
                  type: 'image' as const,
                  source: {
                    type: 'base64' as const,
                    media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/webp',
                    data: base64,
                  },
                },
            {
              type: 'text',
              text: `Extract structured CBAM compliance data from this document: ${doc.filename}`,
            },
          ],
        },
      ],
    });

    // Parse response
    const rawText = message.content
      .filter((c) => c.type === 'text')
      .map((c) => (c as { type: 'text'; text: string }).text)
      .join('');

    if (!rawText) {
      await ctx.supabase
        .from('documents')
        .update({ ocr_status: 'failed' })
        .eq('id', document_id);
      return NextResponse.json(
        { error: { code: 'NO_TEXT_IN_RESPONSE', message: 'Model returned no extractable text' } },
        { status: 422 }
      );
    }

    let extractedData: Record<string, unknown> = {};
    let confidence = 0;

    try {
      const cleaned = rawText.replace(/```json\s?|```/g, '').trim();
      extractedData = JSON.parse(cleaned);

      // Compute average confidence
      const confidenceValues = Object.values(extractedData)
        .filter((v): v is { confidence: number } =>
          typeof v === 'object' && v !== null && 'confidence' in v
        )
        .map((v) => v.confidence);

      confidence =
        confidenceValues.length > 0
          ? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length
          : 50;
    } catch {
      // JSON parse failed — store raw text
      extractedData = { raw_text: rawText, parse_failed: true };
      confidence = 0;
    }

    // Update document with extracted data
    await ctx.supabase
      .from('documents')
      .update({
        ocr_status: 'completed',
        ocr_data: {
          extracted_fields: extractedData,
          raw_text: rawText,
          page_count: 1,
          extraction_model: 'claude-sonnet-4-20250514',
          extracted_at: new Date().toISOString(),
        },
        ocr_confidence: Math.round(confidence),
      })
      .eq('id', document_id);

    // Record usage
    await recordUsage(ctx.supabase, ctx.orgId, 'ai_ocr_page', 1, {
      document_id,
      model: 'claude-sonnet-4-20250514',
    });

    return NextResponse.json({
      data: {
        document_id,
        extracted_fields: extractedData,
        confidence: Math.round(confidence),
        model: 'claude-sonnet-4-20250514',
      },
    });
  } catch (error) {
    // Mark as failed
    await ctx.supabase
      .from('documents')
      .update({ ocr_status: 'failed' })
      .eq('id', document_id);

    console.error('OCR extraction error:', error);
    return NextResponse.json(
      { error: { code: 'OCR_FAILED', message: 'Document extraction failed' } },
      { status: 500 }
    );
  }
});

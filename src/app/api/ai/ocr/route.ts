import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { withAuth, badRequest, notFound } from '@/lib/auth';

const OCR_PROMPT = `You are a CBAM compliance data extraction specialist.
Extract structured data from this document for EU Carbon Border Adjustment Mechanism compliance.

Extract these fields if present (return null if absent):
- document_type: one of invoice, supplier_declaration, customs_document, electricity_bill, production_report, lab_certificate, other
- period: YYYY-Qx format (e.g. "2025-Q1") — infer from invoice date if possible
- supplier_name: company name
- supplier_country: ISO-2 country code
- product_names: array of product names
- cn_codes: array of 8-digit CN codes found
- production_volume: { value: number, unit: string } e.g. {"value": 1200, "unit": "t"}
- direct_emissions: tCO2e value if stated
- indirect_emissions: tCO2e value if stated
- electricity_consumption: MWh value if stated
- fuel_type: fuel used (natural_gas, coal, diesel, etc.)
- fuel_consumption: { value: number, unit: string }
- invoice_date: ISO date string e.g. "2025-03-15"
- invoice_number: string
- total_value: { amount: number, currency: string }

Return ONLY valid JSON. No explanation, no markdown, no code fences.
For each extracted field also return confidence (0-100) and source_text.
Format: {"field_name": {"value": ..., "confidence": 0-100, "source_text": "..."}}
If a field is not found, omit it entirely.`;

export const POST = withAuth(async (request: NextRequest, ctx) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: { code: 'CONFIG_ERROR', message: 'GEMINI_API_KEY is not configured' } },
      { status: 500 }
    );
  }

  const body = await request.json();
  const { document_id } = body;
  if (!document_id) return badRequest('document_id is required');

  // Fetch document record
  const { data: doc } = await ctx.supabase
    .from('documents')
    .select('id, storage_path, filename, mime_type, ocr_status')
    .eq('id', document_id)
    .eq('org_id', ctx.orgId)
    .single();

  if (!doc) return notFound('Document');

  if (doc.ocr_status === 'processing') {
    return NextResponse.json(
      { error: { code: 'ALREADY_PROCESSING', message: 'OCR already in progress' } },
      { status: 409 }
    );
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
      throw new Error(`Storage download failed: ${storageError?.message ?? 'no data'}`);
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    const mimeType = (doc.mime_type ?? 'application/pdf') as string;

    // Call Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    // gemini-1.5-flash supports PDFs and images, has a generous free tier
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType,
          data: base64,
        },
      },
      OCR_PROMPT,
    ]);

    const rawText = result.response.text().trim();

    if (!rawText) {
      throw new Error('Gemini returned empty response');
    }

    // Parse JSON — strip any accidental markdown fences
    let extractedData: Record<string, unknown> = {};
    let confidence = 0;
    let parseOk = false;

    try {
      const cleaned = rawText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      extractedData = JSON.parse(cleaned);
      parseOk = true;

      // Compute average confidence across all fields
      const confidenceValues = Object.values(extractedData)
        .filter((v): v is { confidence: number } =>
          typeof v === 'object' && v !== null && 'confidence' in v && typeof (v as { confidence: number }).confidence === 'number'
        )
        .map((v) => v.confidence);

      confidence =
        confidenceValues.length > 0
          ? Math.round(confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length)
          : 50;
    } catch {
      // Store raw text so the user can see what Gemini returned
      extractedData = { raw_text: rawText, parse_failed: true };
      confidence = 0;
    }

    // Update document with results
    await ctx.supabase
      .from('documents')
      .update({
        ocr_status: parseOk ? 'completed' : 'failed',
        ocr_data: {
          extracted_fields: extractedData,
          raw_text: rawText,
          extraction_model: 'gemini-1.5-flash',
          extracted_at: new Date().toISOString(),
        },
        ocr_confidence: confidence,
      })
      .eq('id', document_id);

    return NextResponse.json({
      data: {
        document_id,
        extracted_fields: extractedData,
        confidence,
        model: 'gemini-1.5-flash',
        parse_ok: parseOk,
      },
    });

  } catch (error) {
    console.error('OCR extraction error:', error);

    await ctx.supabase
      .from('documents')
      .update({ ocr_status: 'failed' })
      .eq('id', document_id);

    const message = error instanceof Error ? error.message : 'Document extraction failed';
    return NextResponse.json(
      { error: { code: 'OCR_FAILED', message } },
      { status: 500 }
    );
  }
});

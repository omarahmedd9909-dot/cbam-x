'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { FileText, Upload, Search, Zap, CheckCircle, Clock, XCircle, Eye, Archive, Filter } from 'lucide-react';
import { clsx } from 'clsx';
import { createClient } from '@/lib/supabase/client';

interface DocumentItem {
  id: string;
  filename: string;
  type: string;
  ocr_status: string;
  ocr_confidence: number | null;
  file_size_bytes: number | null;
  period: string | null;
  created_at: string;
  supplier?: { id: string; name: string } | null;
  ocr_data?: {
    extracted_fields?: Record<string, { value: unknown; confidence: number }>;
  } | null;
}

interface DocumentsClientProps {
  documents: DocumentItem[];
  suppliers: { id: string; name: string }[];
  orgId: string;
  userId: string;
  userRole: string;
}

const OCR_STATUS = {
  pending:    { label: 'Pending',    icon: Clock,        color: 'hsl(var(--ink-tertiary))', badge: 'badge-neutral' },
  processing: { label: 'Processing', icon: Clock,        color: 'hsl(var(--warning))',      badge: 'badge-warning' },
  completed:  { label: 'Extracted',  icon: CheckCircle,  color: 'hsl(var(--success))',      badge: 'badge-success' },
  failed:     { label: 'Failed',     icon: XCircle,      color: 'hsl(var(--danger))',       badge: 'badge-danger'  },
} as const;

const DOC_TYPES = [
  { value: 'invoice',              label: 'Invoice' },
  { value: 'supplier_declaration', label: 'Supplier Declaration' },
  { value: 'customs_document',     label: 'Customs Document' },
  { value: 'electricity_bill',     label: 'Electricity Bill' },
  { value: 'production_report',    label: 'Production Report' },
  { value: 'lab_certificate',      label: 'Lab Certificate' },
  { value: 'other',                label: 'Other' },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function DocumentsClient({ documents: initialDocs, suppliers, orgId, userId, userRole }: DocumentsClientProps) {
  const [documents, setDocuments]   = useState(initialDocs);
  const [search, setSearch]         = useState('');
  const [uploading, setUploading]   = useState(false);
  const [extracting, setExtracting] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null);
  const [uploadForm, setUploadForm] = useState({ type: 'invoice', supplier_id: '', period: '' });
  const [showUpload, setShowUpload] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const supabase = createClient();
  const canEdit = ['admin', 'analyst'].includes(userRole);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles[0]) {
      setPendingFile(acceptedFiles[0]);
      setShowUpload(true);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.jpeg', '.png'] },
    maxSize: 20 * 1024 * 1024,
    multiple: false,
  });

  async function handleUpload() {
    if (!pendingFile) return;
    setUploading(true);

    const ext = pendingFile.name.split('.').pop();
    const path = `${orgId}/${Date.now()}.${ext}`;

    const { error: storageError } = await supabase.storage
      .from('documents')
      .upload(path, pendingFile);

    if (storageError) {
      console.error('Storage upload error:', storageError);
      alert(`Upload failed: ${storageError.message}`);
      setUploading(false);
      return;
    }

    const { data: doc, error: dbError } = await supabase
      .from('documents')
      .insert({
        org_id: orgId,
        uploaded_by: userId,
        filename: pendingFile.name,
        storage_path: path,
        file_size_bytes: pendingFile.size,
        mime_type: pendingFile.type,
        type: uploadForm.type,
        supplier_id: uploadForm.supplier_id || null,
        period: uploadForm.period || null,
        ocr_status: 'pending',
      })
      .select('*, supplier:suppliers(id, name)')
      .single();

    if (dbError || !doc) {
      console.error('Failed to save document record:', dbError);
      alert('Upload failed — could not save document. Please try again.');
      setUploading(false);
      return;
    }

    setDocuments(prev => [doc as DocumentItem, ...prev]);
    setShowUpload(false);
    setPendingFile(null);
    setUploadForm({ type: 'invoice', supplier_id: '', period: '' });
    setUploading(false);
    // Auto-trigger OCR after state is settled
    handleExtract(doc.id);
  }

  async function handleExtract(docId: string) {
    setExtracting(docId);
    setDocuments(prev => prev.map(d => d.id === docId ? { ...d, ocr_status: 'processing' } : d));

    try {
      const res = await fetch('/api/ai/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: docId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message ?? `OCR failed (${res.status})`);
      }

      const result = await res.json();
      if (result.data) {
        setDocuments(prev => prev.map(d =>
          d.id === docId
            ? { ...d, ocr_status: 'completed', ocr_confidence: result.data.confidence, ocr_data: { extracted_fields: result.data.extracted_fields } }
            : d
        ));
      } else {
        throw new Error('No data returned from OCR');
      }
    } catch (err) {
      console.error('OCR extraction error:', err);
      setDocuments(prev => prev.map(d => d.id === docId ? { ...d, ocr_status: 'failed' } : d));
    } finally {
      setExtracting(null);
    }
  }

  const filtered = documents.filter(d =>
    !search ||
    d.filename.toLowerCase().includes(search.toLowerCase()) ||
    (d.supplier?.name ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const currentPeriod = () => {
    const now = new Date();
    return `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;
  };

  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[
          { label: 'Total documents', value: documents.length },
          { label: 'AI extracted',    value: documents.filter(d => d.ocr_status === 'completed').length },
          { label: 'Pending OCR',     value: documents.filter(d => d.ocr_status === 'pending').length },
          { label: 'Failed',          value: documents.filter(d => d.ocr_status === 'failed').length },
        ].map(s => (
          <div key={s.label} className="metric-card">
            <div className="metric-label">{s.label}</div>
            <div className="metric-value">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Upload dropzone */}
      {canEdit && (
        <div
          {...getRootProps()}
          className="mb-5 border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all"
          style={{
            borderColor: isDragActive ? 'hsl(var(--accent))' : 'hsl(var(--border))',
            background: isDragActive ? 'hsl(var(--accent-subtle))' : 'transparent',
          }}
        >
          <input {...getInputProps()} />
          <Upload className="w-8 h-8 mx-auto mb-2" style={{ color: 'hsl(var(--ink-tertiary))' }} />
          <p className="text-sm font-medium" style={{ color: 'hsl(var(--ink-primary))' }}>
            {isDragActive ? 'Drop to upload' : 'Drag & drop a document here'}
          </p>
          <p className="text-xs mt-1" style={{ color: 'hsl(var(--ink-tertiary))' }}>
            PDF, JPG, PNG up to 20MB — AI will extract compliance data automatically
          </p>
        </div>
      )}

      {/* Search */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'hsl(var(--ink-tertiary))' }} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search documents…" className="input pl-9" />
        </div>
      </div>

      {/* Documents table */}
      <div className="card p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="w-10 h-10 mb-3" style={{ color: 'hsl(var(--ink-tertiary))' }} />
            <p className="text-sm" style={{ color: 'hsl(var(--ink-secondary))' }}>No documents yet — upload your first document above</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Filename</th>
                <th>Type</th>
                <th>Supplier</th>
                <th>Period</th>
                <th>AI Extraction</th>
                <th>Uploaded</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map(doc => {
                const statusKey = doc.ocr_status as keyof typeof OCR_STATUS;
                const status = OCR_STATUS[statusKey] ?? OCR_STATUS.pending;
                const StatusIcon = status.icon;
                const isExtracting = extracting === doc.id;

                return (
                  <tr key={doc.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 flex-shrink-0" style={{ color: 'hsl(var(--accent))' }} />
                        <span className="font-medium truncate max-w-[200px]" style={{ color: 'hsl(var(--ink-primary))' }}>
                          {doc.filename}
                        </span>
                      </div>
                      {doc.file_size_bytes && (
                        <div className="text-xs ml-6" style={{ color: 'hsl(var(--ink-tertiary))' }}>
                          {formatBytes(doc.file_size_bytes)}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-neutral capitalize">
                        {doc.type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ color: 'hsl(var(--ink-secondary))' }}>
                      {doc.supplier?.name ?? '—'}
                    </td>
                    <td style={{ color: 'hsl(var(--ink-secondary))' }}>
                      {doc.period ?? '—'}
                    </td>
                    <td>
                      {isExtracting ? (
                        <span className="badge badge-warning">Extracting…</span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <StatusIcon className="w-3.5 h-3.5" style={{ color: status.color }} />
                          <span className={clsx('badge', status.badge)}>{status.label}</span>
                          {doc.ocr_status === 'completed' && doc.ocr_confidence && (
                            <span className="text-xs" style={{ color: 'hsl(var(--ink-tertiary))' }}>
                              {doc.ocr_confidence}%
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{ color: 'hsl(var(--ink-tertiary))' }}>
                      {formatDate(doc.created_at)}
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        {doc.ocr_status === 'completed' && (
                          <button
                            onClick={() => setSelectedDoc(doc)}
                            className="btn btn-ghost btn-sm"
                            title="View extracted data"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {(doc.ocr_status === 'pending' || doc.ocr_status === 'failed') && canEdit && (
                          <button
                            onClick={() => handleExtract(doc.id)}
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'hsl(var(--accent))' }}
                            title="Extract data with AI"
                          >
                            <Zap className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Upload modal */}
      {showUpload && pendingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'hsl(0 0% 0% / 0.5)' }}>
          <div className="w-full max-w-md card">
            <h2 className="text-base font-semibold mb-4" style={{ color: 'hsl(var(--ink-primary))' }}>
              Upload document
            </h2>
            <div className="p-3 rounded-lg mb-4" style={{ background: 'hsl(var(--surface-sunken))' }}>
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" style={{ color: 'hsl(var(--accent))' }} />
                <span className="text-sm font-medium" style={{ color: 'hsl(var(--ink-primary))' }}>{pendingFile.name}</span>
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'hsl(var(--ink-tertiary))' }}>{formatBytes(pendingFile.size)}</div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>Document type</label>
                <select value={uploadForm.type} onChange={e => setUploadForm({ ...uploadForm, type: e.target.value })} className="input">
                  {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>Supplier</label>
                  <select value={uploadForm.supplier_id} onChange={e => setUploadForm({ ...uploadForm, supplier_id: e.target.value })} className="input">
                    <option value="">Not linked</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>Period</label>
                  <input type="text" value={uploadForm.period} onChange={e => setUploadForm({ ...uploadForm, period: e.target.value })} placeholder={currentPeriod()} className="input font-mono" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => { setShowUpload(false); setPendingFile(null); }} className="btn btn-secondary btn-sm">Cancel</button>
              <button onClick={handleUpload} disabled={uploading} className="btn btn-primary btn-sm">
                {uploading ? 'Uploading…' : 'Upload & extract'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OCR results modal */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'hsl(0 0% 0% / 0.5)' }}
          onClick={e => e.target === e.currentTarget && setSelectedDoc(null)}>
          <div className="w-full max-w-lg card max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold" style={{ color: 'hsl(var(--ink-primary))' }}>Extracted data</h2>
              <button onClick={() => setSelectedDoc(null)} className="btn btn-ghost btn-sm">✕</button>
            </div>
            <div className="text-sm font-medium mb-3" style={{ color: 'hsl(var(--ink-secondary))' }}>{selectedDoc.filename}</div>
            {selectedDoc.ocr_data?.extracted_fields ? (
              <div className="space-y-2">
                {Object.entries(selectedDoc.ocr_data.extracted_fields).map(([key, val]) => (
                  <div key={key} className="flex items-start justify-between p-2 rounded" style={{ background: 'hsl(var(--surface-sunken))' }}>
                    <div>
                      <div className="text-xs font-medium capitalize" style={{ color: 'hsl(var(--ink-secondary))' }}>{key.replace(/_/g, ' ')}</div>
                      <div className="text-sm mt-0.5" style={{ color: 'hsl(var(--ink-primary))' }}>{String((val as { value: unknown }).value ?? '—')}</div>
                    </div>
                    <span className="badge badge-neutral text-xs">{(val as { confidence: number }).confidence}%</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'hsl(var(--ink-tertiary))' }}>No extracted data available.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Globe, Building2, Factory, Package, Users, CheckCircle, ArrowRight, ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { IndustrySector } from '@/types/domain';

// ----------------------------------------------------------------
// Step definitions
// ----------------------------------------------------------------

const STEPS = [
  { id: 1, label: 'Organisation', icon: Building2 },
  { id: 2, label: 'Sector', icon: Factory },
  { id: 3, label: 'First facility', icon: Factory },
  { id: 4, label: 'First product', icon: Package },
  { id: 5, label: 'Your team', icon: Users },
] as const;

const SECTORS: { value: IndustrySector; label: string; emoji: string }[] = [
  { value: 'iron_steel', label: 'Iron & Steel', emoji: '🏗️' },
  { value: 'aluminum', label: 'Aluminium', emoji: '🔩' },
  { value: 'cement', label: 'Cement', emoji: '🏭' },
  { value: 'fertilizers', label: 'Fertilizers', emoji: '🌾' },
  { value: 'hydrogen', label: 'Hydrogen', emoji: '⚗️' },
  { value: 'electricity', label: 'Electricity', emoji: '⚡' },
  { value: 'other', label: 'Other / Multiple', emoji: '📦' },
];

const COUNTRIES = [
  { code: 'EG', name: 'Egypt' },
  { code: 'TR', name: 'Turkey' },
  { code: 'IN', name: 'India' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'MA', name: 'Morocco' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'CN', name: 'China' },
  { code: 'BR', name: 'Brazil' },
  { code: 'UA', name: 'Ukraine' },
  { code: 'OTHER', name: 'Other' },
];

// ----------------------------------------------------------------
// Main onboarding component
// ----------------------------------------------------------------

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [orgName, setOrgName] = useState('');
  const [orgCountry, setOrgCountry] = useState('');
  const [orgTaxId, setOrgTaxId] = useState('');
  const [sectors, setSectors] = useState<IndustrySector[]>([]);
  const [facilityName, setFacilityName] = useState('');
  const [facilityCountry, setFacilityCountry] = useState('');
  const [facilitySector, setFacilitySector] = useState<IndustrySector | ''>('');
  const [productName, setProductName] = useState('');
  const [productCnCode, setProductCnCode] = useState('');
  const [teamEmails, setTeamEmails] = useState('');
  const [orgId, setOrgId] = useState('');
  const [facilityId, setFacilityId] = useState('');

  function toggleSector(s: IndustrySector) {
    setSectors((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }

  async function handleNext() {
    setError('');
    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      if (step === 1) {
        // Create organization
        const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const { data: org, error: orgError } = await supabase
          .from('organizations')
          .insert({
            name: orgName.trim(),
            slug: `${slug}-${Date.now()}`,
            country: orgCountry,
            industry_sectors: sectors,
            tax_id: orgTaxId || null,
          })
          .select('id')
          .single();

        if (orgError || !org) { setError(orgError?.message ?? 'Failed to create organisation.'); return; }
        setOrgId(org.id);

        // Update user with org
        await supabase
          .from('users')
          .update({ org_id: org.id, full_name: null })
          .eq('id', user.id);

        setStep(2);
      } else if (step === 2) {
        setStep(3);
      } else if (step === 3) {
        // Create first facility
        const { data: facility, error: facError } = await supabase
          .from('facilities')
          .insert({
            org_id: orgId,
            name: facilityName.trim(),
            country: facilityCountry,
            industry_sector: facilitySector as IndustrySector,
          })
          .select('id')
          .single();

        if (facError || !facility) { setError(facError?.message ?? 'Failed to create facility.'); return; }
        setFacilityId(facility.id);
        setStep(4);
      } else if (step === 4) {
        // Create first product
        if (productName && productCnCode) {
          await supabase.from('products').insert({
            org_id: orgId,
            facility_id: facilityId,
            name: productName.trim(),
            cn_code: productCnCode.trim(),
            unit_of_measure: 't',
          });
        }
        setStep(5);
      } else if (step === 5) {
        // Invite team members (fire and forget)
        const emails = teamEmails
          .split(/[\n,;]+/)
          .map((e) => e.trim())
          .filter((e) => e.includes('@'));

        // Send invitations (non-blocking)
        if (emails.length > 0) {
          await supabase.functions.invoke('send-invitations', {
            body: { org_id: orgId, emails, role: 'analyst' },
          });
        }

        // Mark onboarding complete
        await supabase
          .from('organizations')
          .update({ onboarding_completed: true })
          .eq('id', orgId);

        router.push('/dashboard');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const canProceed = (): boolean => {
    if (step === 1) return orgName.trim().length >= 2 && !!orgCountry;
    if (step === 2) return sectors.length > 0;
    if (step === 3) return !!facilityName && !!facilityCountry && !!facilitySector;
    return true; // steps 4 and 5 are optional
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'hsl(var(--surface-sunken))' }}
    >
      {/* Header */}
      <header className="flex items-center gap-3 px-8 py-6">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: 'hsl(var(--accent))' }}
        >
          <Globe className="w-4 h-4 text-white" />
        </div>
        <span className="text-sm font-semibold" style={{ color: 'hsl(var(--ink-primary))' }}>
          CBAM X
        </span>
      </header>

      <div className="flex-1 flex items-start justify-center px-4 pt-8 pb-16">
        <div className="w-full max-w-lg">
          {/* Progress */}
          <div className="flex items-center gap-2 mb-8">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2 flex-1">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 transition-all"
                  style={{
                    background: s.id < step ? 'hsl(var(--success))' :
                               s.id === step ? 'hsl(var(--accent))' :
                               'hsl(var(--border))',
                    color: s.id <= step ? 'white' : 'hsl(var(--ink-tertiary))',
                  }}
                >
                  {s.id < step ? <CheckCircle className="w-4 h-4" /> : s.id}
                </div>
                <span
                  className="text-xs hidden sm:block"
                  style={{
                    color: s.id === step ? 'hsl(var(--ink-primary))' : 'hsl(var(--ink-tertiary))',
                    fontWeight: s.id === step ? 500 : 400,
                  }}
                >
                  {s.label}
                </span>
                {i < STEPS.length - 1 && (
                  <div
                    className="flex-1 h-px mx-1"
                    style={{
                      background: s.id < step ? 'hsl(var(--success))' : 'hsl(var(--border))',
                    }}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Step content */}
          <div className="card">
            {step === 1 && (
              <StepOrg
                name={orgName} setName={setOrgName}
                country={orgCountry} setCountry={setOrgCountry}
                taxId={orgTaxId} setTaxId={setOrgTaxId}
              />
            )}
            {step === 2 && (
              <StepSectors selected={sectors} onToggle={toggleSector} />
            )}
            {step === 3 && (
              <StepFacility
                name={facilityName} setName={setFacilityName}
                country={facilityCountry} setCountry={setFacilityCountry}
                sector={facilitySector} setSector={setFacilitySector}
                sectors={sectors}
              />
            )}
            {step === 4 && (
              <StepProduct
                name={productName} setName={setProductName}
                cnCode={productCnCode} setCnCode={setProductCnCode}
              />
            )}
            {step === 5 && (
              <StepTeam emails={teamEmails} setEmails={setTeamEmails} />
            )}

            {error && (
              <p
                className="mt-3 text-xs p-2 rounded-md"
                style={{ color: 'hsl(var(--danger))', background: 'hsl(var(--danger-muted))' }}
              >
                {error}
              </p>
            )}

            <div className="flex items-center justify-between mt-6 pt-4" style={{ borderTop: '1px solid hsl(var(--border-subtle))' }}>
              {step > 1 ? (
                <button
                  onClick={() => setStep((s) => s - 1)}
                  className="btn btn-ghost btn-sm flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back
                </button>
              ) : <div />}

              <div className="flex items-center gap-3">
                {step >= 4 && (
                  <button
                    onClick={() => {
                      if (step === 4) setStep(5);
                      else handleNext();
                    }}
                    className="btn btn-ghost btn-sm"
                    style={{ color: 'hsl(var(--ink-secondary))' }}
                  >
                    Skip for now
                  </button>
                )}
                <button
                  onClick={handleNext}
                  disabled={saving || !canProceed()}
                  className="btn btn-primary btn-sm flex items-center gap-1.5"
                >
                  {saving ? 'Saving...' : step === 5 ? 'Launch dashboard' : 'Continue'}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
// Step sub-components
// ----------------------------------------------------------------

function StepOrg({ name, setName, country, setCountry, taxId, setTaxId }: {
  name: string; setName: (v: string) => void;
  country: string; setCountry: (v: string) => void;
  taxId: string; setTaxId: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold mb-0.5" style={{ color: 'hsl(var(--ink-primary))' }}>
          Tell us about your organisation
        </h2>
        <p className="text-sm" style={{ color: 'hsl(var(--ink-secondary))' }}>
          We&apos;ll set up your compliance workspace around your business.
        </p>
      </div>
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>
          Company name *
        </label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Steel Ltd." className="input" autoFocus />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>
          Country of registration *
        </label>
        <select value={country} onChange={(e) => setCountry(e.target.value)} className="input">
          <option value="">Select country</option>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>
          Tax ID / VAT number
          <span className="font-normal ml-1" style={{ color: 'hsl(var(--ink-tertiary))' }}>(optional)</span>
        </label>
        <input type="text" value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="e.g. EG123456789" className="input" />
      </div>
    </div>
  );
}

function StepSectors({ selected, onToggle }: {
  selected: IndustrySector[];
  onToggle: (s: IndustrySector) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold mb-0.5" style={{ color: 'hsl(var(--ink-primary))' }}>
          Which CBAM sectors apply to you?
        </h2>
        <p className="text-sm" style={{ color: 'hsl(var(--ink-secondary))' }}>
          Select all goods you export to the EU. We&apos;ll configure your compliance checks accordingly.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {SECTORS.map((s) => {
          const active = selected.includes(s.value);
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => onToggle(s.value)}
              className="flex items-center gap-3 p-3 rounded-lg border text-left transition-all"
              style={{
                borderColor: active ? 'hsl(var(--accent))' : 'hsl(var(--border))',
                background: active ? 'hsl(var(--accent-subtle))' : 'transparent',
                color: 'hsl(var(--ink-primary))',
              }}
            >
              <span className="text-lg">{s.emoji}</span>
              <span className="text-sm font-medium">{s.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepFacility({ name, setName, country, setCountry, sector, setSector, sectors }: {
  name: string; setName: (v: string) => void;
  country: string; setCountry: (v: string) => void;
  sector: IndustrySector | ''; setSector: (v: IndustrySector | '') => void;
  sectors: IndustrySector[];
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold mb-0.5" style={{ color: 'hsl(var(--ink-primary))' }}>
          Add your first production facility
        </h2>
        <p className="text-sm" style={{ color: 'hsl(var(--ink-secondary))' }}>
          Each CBAM calculation is tied to a facility. You can add more later.
        </p>
      </div>
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>
          Facility name *
        </label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Main Plant — Cairo" className="input" autoFocus />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>
          Facility country *
        </label>
        <select value={country} onChange={(e) => setCountry(e.target.value)} className="input">
          <option value="">Select country</option>
          {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>
          Industry sector *
        </label>
        <select value={sector} onChange={(e) => setSector(e.target.value as IndustrySector)} className="input">
          <option value="">Select sector</option>
          {SECTORS.filter((s) => s.value === 'other' || sectors.includes(s.value)).map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function StepProduct({ name, setName, cnCode, setCnCode }: {
  name: string; setName: (v: string) => void;
  cnCode: string; setCnCode: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold mb-0.5" style={{ color: 'hsl(var(--ink-primary))' }}>
          Add your first product
          <span className="ml-2 text-xs font-normal" style={{ color: 'hsl(var(--ink-tertiary))' }}>optional</span>
        </h2>
        <p className="text-sm" style={{ color: 'hsl(var(--ink-secondary))' }}>
          Products are identified by their 8-digit CN code. We&apos;ll verify CBAM coverage automatically.
        </p>
      </div>
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>
          Product name
        </label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Hot-rolled steel coil" className="input" autoFocus />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>
          CN code
        </label>
        <input
          type="text"
          value={cnCode}
          onChange={(e) => setCnCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
          placeholder="72081000"
          className="input font-mono"
          maxLength={8}
        />
        <p className="text-xs mt-1" style={{ color: 'hsl(var(--ink-tertiary))' }}>
          The 8-digit Combined Nomenclature code from your customs documents.
        </p>
      </div>
    </div>
  );
}

function StepTeam({ emails, setEmails }: {
  emails: string; setEmails: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold mb-0.5" style={{ color: 'hsl(var(--ink-primary))' }}>
          Invite your team
          <span className="ml-2 text-xs font-normal" style={{ color: 'hsl(var(--ink-tertiary))' }}>optional</span>
        </h2>
        <p className="text-sm" style={{ color: 'hsl(var(--ink-secondary))' }}>
          Add colleagues who need access to the compliance workspace. You can always add more from Settings.
        </p>
      </div>
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>
          Email addresses
        </label>
        <textarea
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder="analyst@company.com&#10;compliance@company.com"
          rows={4}
          className="input h-auto py-2"
          style={{ resize: 'none', lineHeight: '1.6' }}
        />
        <p className="text-xs mt-1" style={{ color: 'hsl(var(--ink-tertiary))' }}>
          Separate multiple addresses with commas, semicolons, or new lines.
        </p>
      </div>
    </div>
  );
}

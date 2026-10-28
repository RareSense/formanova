import { useState, useEffect, useCallback } from 'react';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Pencil, Ban, Plus, Loader2, TicketPercent } from 'lucide-react';
import { toast } from 'sonner';
import type { PromoCode, CreatePromoCodePayload, UpdatePromoCodePayload } from '@/types/promo';
import { parseServerTime } from '@/lib/server-time';

const API_BASE = '/api/credits/admin/ui/promo-codes';

function formatDate(iso: string | null) {
  if (!iso) return 'Never';
  return parseServerTime(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function codeStatus(code: PromoCode): 'active' | 'expired' | 'inactive' {
  if (code.expires_at && parseServerTime(code.expires_at) <= new Date()) return 'expired';
  if (!code.is_active) return 'inactive';
  return 'active';
}

const CODE_REGEX = /^[A-Z0-9_-]+$/;

export default function PromoAdminPage() {
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<PromoCode | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<PromoCode | null>(null);
  const [saving, setSaving] = useState(false);
  const [inlineError, setInlineError] = useState('');

  // Form state
  const [formCode, setFormCode] = useState('');
  const [formCredits, setFormCredits] = useState('');
  const [formCampaign, setFormCampaign] = useState('');
  const [formMaxRedemptions, setFormMaxRedemptions] = useState('');
  const [formStartsAt, setFormStartsAt] = useState('');
  const [formExpiresAt, setFormExpiresAt] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);

  const fetchCodes = useCallback(async () => {
    setFetchError(null);
    try {
      const res = await authenticatedFetch(`${API_BASE}?include_inactive=true`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const detail = body?.detail || body?.message || `HTTP ${res.status}`;
        if (res.status === 403) {
          setFetchError('Your account is not authorized on the backend gateway. Contact the system administrator to add your email to the backend whitelist.');
        } else {
          setFetchError(detail);
        }
        throw new Error(detail);
      }
      setCodes(await res.json());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load promo codes';
      if (!fetchError) setFetchError(message);
      toast.error(`Failed to load promo codes: ${message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCodes(); }, [fetchCodes]);

  function resetForm() {
    setFormCode('');
    setFormCredits('');
    setFormCampaign('');
    setFormMaxRedemptions('');
    setFormStartsAt('');
    setFormExpiresAt('');
    setFormNotes('');
    setFormIsActive(true);
    setInlineError('');
  }

  function openCreate() {
    setEditingCode(null);
    resetForm();
    setSheetOpen(true);
  }

  function openEdit(c: PromoCode) {
    setEditingCode(c);
    setFormCode(c.code);
    setFormCredits(String(c.credits_awarded));
    setFormCampaign(c.campaign_name ?? '');
    setFormMaxRedemptions(c.max_redemptions !== null ? String(c.max_redemptions) : '');
    setFormStartsAt(c.starts_at ? c.starts_at.slice(0, 16) : '');
    setFormExpiresAt(c.expires_at ? c.expires_at.slice(0, 16) : '');
    setFormNotes(c.notes ?? '');
    setFormIsActive(c.is_active);
    setInlineError('');
    setSheetOpen(true);
  }

  function handleCodeInput(value: string) {
    // Force uppercase, strip invalid chars
    setFormCode(value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 64));
  }

  async function handleSave() {
    setInlineError('');

    if (!editingCode) {
      // Create validation
      if (!formCode.trim() || formCode.length < 3) {
        setInlineError('Code must be at least 3 characters.');
        return;
      }
      if (!CODE_REGEX.test(formCode)) {
        setInlineError('Code may only contain A–Z, 0–9, hyphens, and underscores.');
        return;
      }
      const credits = Number(formCredits);
      if (!credits || credits < 1) {
        setInlineError('Credits must be at least 1.');
        return;
      }

      const payload: CreatePromoCodePayload = {
        code: formCode,
        credits_awarded: credits,
        per_user_limit: 1,
      };
      if (formCampaign.trim()) payload.campaign_name = formCampaign.trim().slice(0, 120);
      if (formMaxRedemptions) payload.max_redemptions = Number(formMaxRedemptions);
      if (formStartsAt) payload.starts_at = new Date(formStartsAt).toISOString();
      if (formExpiresAt) payload.expires_at = new Date(formExpiresAt).toISOString();
      if (formNotes.trim()) payload.notes = formNotes.trim();

      setSaving(true);
      try {
        const res = await authenticatedFetch(API_BASE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.status === 409) {
          setInlineError('A code with this name already exists.');
          return;
        }
        if (!res.ok) throw new Error('Save failed');

        toast.success(`Promo code "${formCode}" created`);
        setSheetOpen(false);
        fetchCodes();
      } catch {
        toast.error('Something went wrong');
      } finally {
        setSaving(false);
      }
    } else {
      // Edit — only send changed fields
      const payload: UpdatePromoCodePayload = {};
      const trimmedCampaign = formCampaign.trim();
      if (trimmedCampaign !== (editingCode.campaign_name ?? '')) {
        payload.campaign_name = trimmedCampaign || null;
      }
      if (formMaxRedemptions !== (editingCode.max_redemptions !== null ? String(editingCode.max_redemptions) : '')) {
        payload.max_redemptions = formMaxRedemptions ? Number(formMaxRedemptions) : null;
      }
      const oldStartsSlice = editingCode.starts_at ? editingCode.starts_at.slice(0, 16) : '';
      if (formStartsAt !== oldStartsSlice) {
        payload.starts_at = formStartsAt ? new Date(formStartsAt).toISOString() : null;
      }
      const oldExpiresSlice = editingCode.expires_at ? editingCode.expires_at.slice(0, 16) : '';
      if (formExpiresAt !== oldExpiresSlice) {
        payload.expires_at = formExpiresAt ? new Date(formExpiresAt).toISOString() : null;
      }
      if (formNotes.trim() !== (editingCode.notes ?? '')) {
        payload.notes = formNotes.trim() || null;
      }
      if (formIsActive !== editingCode.is_active) payload.is_active = formIsActive;

      if (Object.keys(payload).length === 0) {
        setSheetOpen(false);
        return;
      }

      setSaving(true);
      try {
        const res = await authenticatedFetch(`${API_BASE}/${editingCode.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          if (body?.detail || body?.message) {
            setInlineError(body.detail || body.message);
            return;
          }
          throw new Error('Save failed');
        }

        toast.success('Promo code updated');
        setSheetOpen(false);
        fetchCodes();
      } catch {
        toast.error('Something went wrong');
      } finally {
        setSaving(false);
      }
    }
  }

  async function handleDeactivate() {
    if (!deactivateTarget) return;
    try {
      const res = await authenticatedFetch(`${API_BASE}/${deactivateTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      });
      if (!res.ok) throw new Error();
      toast.success(`"${deactivateTarget.code}" deactivated`);
      setDeactivateTarget(null);
      fetchCodes();
    } catch {
      toast.error('Failed to deactivate');
    }
  }

  return (
    <>
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-8">
        {/* Action bar */}
        <div className="flex items-center justify-end mb-6">
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New Promo Code</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : fetchError ? (
          <div className="text-center py-20 space-y-3">
            <p className="text-destructive font-medium">Failed to load promo codes</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">{fetchError}</p>
            <Button variant="outline" size="sm" onClick={() => { setLoading(true); fetchCodes(); }} className="mt-4">
              Retry
            </Button>
          </div>
        ) : codes.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            No promo codes yet. Create your first one.
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block border border-border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>Code</TableHead>
                    <TableHead>Campaign</TableHead>
                    <TableHead className="text-right">Credits</TableHead>
                    <TableHead className="text-right">Redemptions</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {codes.map((c) => {
                    const status = codeStatus(c);
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono font-medium text-foreground tracking-wide">
                          {c.code}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {c.campaign_name || '—'}
                        </TableCell>
                        <TableCell className="text-right font-medium text-foreground">
                          {c.credits_awarded}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {c.redeemed_count} / {c.max_redemptions !== null ? c.max_redemptions : '∞'}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={status} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(c.expires_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(c)} title="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {c.is_active && (
                              <Button
                                variant="ghost" size="icon"
                                onClick={() => setDeactivateTarget(c)}
                                title="Deactivate"
                                className="text-destructive hover:text-destructive"
                              >
                                <Ban className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {codes.map((c) => {
                const status = codeStatus(c);
                return (
                  <div key={c.id} className="border border-border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-medium text-foreground tracking-wide text-sm">
                        {c.code}
                      </span>
                      <StatusBadge status={status} />
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Campaign</span>
                        <p className="text-foreground">{c.campaign_name || '—'}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Credits</span>
                        <p className="text-foreground font-medium">{c.credits_awarded}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Redemptions</span>
                        <p className="text-foreground">{c.redeemed_count} / {c.max_redemptions !== null ? c.max_redemptions : '∞'}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Expiry</span>
                        <p className="text-foreground">{formatDate(c.expires_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Button variant="outline" size="sm" onClick={() => openEdit(c)} className="gap-1.5">
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                      {c.is_active && (
                        <Button
                          variant="outline" size="sm"
                          onClick={() => setDeactivateTarget(c)}
                          className="gap-1.5 text-destructive hover:text-destructive"
                        >
                          <Ban className="h-3.5 w-3.5" />
                          Deactivate
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Create / Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingCode ? 'Edit Promo Code' : 'New Promo Code'}</SheetTitle>
            <SheetDescription>
              {editingCode ? 'Update the details for this promo code.' : 'Create a new promotional credit code.'}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 py-4">
            {/* Code */}
            <div className="space-y-2">
              <Label htmlFor="promo-code">Code</Label>
              {editingCode ? (
                <Input id="promo-code" value={formCode} disabled className="font-mono" />
              ) : (
                <Input
                  id="promo-code"
                  placeholder="e.g. WELCOME50"
                  value={formCode}
                  onChange={(e) => handleCodeInput(e.target.value)}
                  maxLength={64}
                  className="font-mono"
                />
              )}
            </div>

            {/* Credits */}
            <div className="space-y-2">
              <Label htmlFor="promo-credits">Credits Awarded</Label>
              {editingCode ? (
                <Input id="promo-credits" value={formCredits} disabled />
              ) : (
                <Input
                  id="promo-credits"
                  type="number"
                  min={1}
                  placeholder="50"
                  value={formCredits}
                  onChange={(e) => setFormCredits(e.target.value)}
                />
              )}
            </div>

            {/* Campaign */}
            <div className="space-y-2">
              <Label htmlFor="promo-campaign">Campaign Name</Label>
              <Input
                id="promo-campaign"
                placeholder="e.g. Launch Promo"
                value={formCampaign}
                onChange={(e) => setFormCampaign(e.target.value.slice(0, 120))}
                maxLength={120}
              />
            </div>

            {/* Max Redemptions */}
            <div className="space-y-2">
              <Label htmlFor="promo-max">Max Redemptions</Label>
              <Input
                id="promo-max"
                type="number"
                min={1}
                placeholder="Unlimited"
                value={formMaxRedemptions}
                onChange={(e) => setFormMaxRedemptions(e.target.value)}
              />
            </div>

            {/* Starts At */}
            <div className="space-y-2">
              <Label htmlFor="promo-starts">Starts At</Label>
              <Input
                id="promo-starts"
                type="datetime-local"
                value={formStartsAt}
                onChange={(e) => setFormStartsAt(e.target.value)}
              />
            </div>

            {/* Expires At */}
            <div className="space-y-2">
              <Label htmlFor="promo-expires">Expires At</Label>
              <Input
                id="promo-expires"
                type="datetime-local"
                value={formExpiresAt}
                onChange={(e) => setFormExpiresAt(e.target.value)}
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="promo-notes">Notes</Label>
              <Textarea
                id="promo-notes"
                placeholder="Internal notes…"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={3}
              />
            </div>

            {/* Active toggle (edit only) */}
            {editingCode && (
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <Label htmlFor="promo-active" className="cursor-pointer">Active</Label>
                <Switch
                  id="promo-active"
                  checked={formIsActive}
                  onCheckedChange={setFormIsActive}
                />
              </div>
            )}

            {/* Inline error */}
            {inlineError && (
              <p className="text-sm text-destructive">{inlineError}</p>
            )}
          </div>

          <SheetFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setSheetOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingCode ? 'Save Changes' : 'Create Code'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Deactivate Confirm */}
      <AlertDialog open={!!deactivateTarget} onOpenChange={(o) => !o && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate "{deactivateTarget?.code}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The code will no longer be redeemable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeactivate} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  
  );
}

function StatusBadge({ status }: { status: 'active' | 'expired' | 'inactive' }) {
  if (status === 'active') {
    return (
      <Badge variant="default" className="bg-primary/15 text-primary border-primary/20">
        Active
      </Badge>
    );
  }
  if (status === 'expired') {
    return (
      <Badge variant="secondary" className="bg-destructive/15 text-destructive border-destructive/20">
        Expired
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="bg-muted text-muted-foreground">
      Inactive
    </Badge>
  );
}

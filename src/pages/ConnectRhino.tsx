import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Check, Copy, Loader2 } from 'lucide-react';
import { getStoredToken, getStoredUser } from '@/lib/auth-api';
import { rhinoCallbackUrl } from '@/lib/rhino-connect';
import rhinoLogo from '@/assets/rhino-logo.png';

/**
 * Signs FormaNova for Rhino in with the account signed in here (Google).
 * A current plug-in opens this page with ?port=&state= and receives the key directly (see rhino-connect.ts),
 * so there is nothing to copy. Copying the key stays as the backup, and is the only way for older plug-ins.
 */
export default function ConnectRhino() {
  const [params] = useSearchParams();
  const [copied, setCopied] = useState(false);
  const [showCopy, setShowCopy] = useState(false);
  const user = getStoredUser();
  const token = getStoredToken();
  const callback = rhinoCallbackUrl(params.get('port'), params.get('state'), token);

  useEffect(() => {
    if (!callback) return;
    // A moment on screen so the person sees which account Rhino is signing in as.
    const timer = window.setTimeout(() => window.location.replace(callback), 900);
    return () => window.clearTimeout(timer);
  }, [callback]);

  const copy = async () => {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 4000);
  };

  const copyButton = (
    <Button size="lg" variant={callback ? 'outline' : 'default'} className="w-full rounded-none" onClick={copy}>
      {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
      {copied ? 'Copied. Rhino picks it up by itself' : 'Copy sign-in key'}
    </Button>
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <Helmet>
        <title>Connect Rhino | FormaNova</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <Card className="w-full max-w-md rounded-none border-border bg-card">
        <CardContent className="flex flex-col items-center text-center py-10 px-8">
          <img src={rhinoLogo} alt="Rhino" width={56} height={56} className="h-14 w-14 rounded-none mb-6" />
          <h1 className="text-2xl font-display tracking-wide text-foreground mb-2">Connect Rhino</h1>
          <p className="text-muted-foreground text-sm mb-8">
            Signing in as <span className="text-foreground">{user?.email ?? 'your account'}</span>
          </p>

          {callback ? (
            <>
              <div className="flex items-center gap-3 text-foreground mb-8">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Connecting to Rhino…</span>
              </div>
              {showCopy ? (
                <div className="w-full space-y-3">
                  {copyButton}
                  <p className="text-muted-foreground text-xs">Then go back to Rhino.</p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCopy(true)}
                  className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                >
                  Not connecting? Copy the key instead
                </button>
              )}
            </>
          ) : (
            <div className="w-full space-y-3">
              {copyButton}
              <p className="text-muted-foreground text-xs">Then go back to Rhino. It signs in by itself.</p>
            </div>
          )}

          <p className="text-muted-foreground/70 text-xs mt-8">This key signs in as you. Don't share it.</p>
        </CardContent>
      </Card>
    </div>
  );
}

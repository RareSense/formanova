import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Check, Copy } from 'lucide-react';
import { getStoredToken, getStoredUser } from '@/lib/auth-api';

/**
 * Signs FormaNova for Rhino in with the account already signed in here (Google).
 * The plug-in opens this page; the person copies their sign-in key and pastes it into Rhino.
 * The key is the same one this site uses, so the server still decides who it belongs to.
 */
export default function ConnectRhino() {
  const [copied, setCopied] = useState(false);
  const user = getStoredUser();

  const copy = async () => {
    const token = getStoredToken();
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 4000);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Helmet>
        <title>Connect Rhino | FormaNova</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <Card className="max-w-md w-full border-border/50 bg-card/50">
        <CardContent className="flex flex-col items-center text-center py-8 px-6 space-y-5">
          <h1 className="text-2xl font-display tracking-wide">Connect Rhino</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Sign FormaNova for Rhino in as <span className="text-foreground">{user?.email ?? 'your account'}</span>.
            Copy the key, then paste it into the FormaNova panel in Rhino.
          </p>
          <Button size="lg" className="w-full" onClick={copy}>
            {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
            {copied ? 'Copied. Paste it in Rhino' : 'Copy Rhino sign-in key'}
          </Button>
          <p className="text-muted-foreground text-xs leading-relaxed">
            This key signs in as you. Don't share it with anyone.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

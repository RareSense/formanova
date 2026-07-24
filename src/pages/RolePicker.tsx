import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Loader2, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import {
  type UserType,
  isOnboardingComplete,
  markOnboardingComplete,
  saveUserType,
  setCachedUserType,
} from '@/lib/onboarding-api';
import { trackUserTypeSelected } from '@/lib/posthog-events';
import { toast } from '@/hooks/use-toast';
import { JewelryBrandModal, type BrandDetails } from '@/components/JewelryBrandModal';

// ---------------------------------------------------------------------------
// Inline SVG icons — all use currentColor so they adapt to any theme.
// White details replaced with hsl(var(--primary-foreground)) so they stay
// visible even when the primary color is light/white.
// ---------------------------------------------------------------------------

type IconProps = { className?: string };

function JewelryBrandIcon({ className }: IconProps) {
  return (
    <svg width="100%" viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true" fill="currentColor">
      <g><path d="m33 24.8c-9.9 0-18 8.1-18 18s8.1 18 18 18 18-8.1 18-18-8.1-18-18-18zm0 34.1c-8.8 0-16-7.2-16-16s7.2-16 16-16 16 7.2 16 16-7.2 16-16 16z"/><path d="m39 21.5v-3l8.9-10.5c.3-.4.3-.9 0-1.3l-4.7-5.3c-.2-.3-.5-.4-.8-.4h-18.8c-.3 0-.6.1-.7.3l-4.8 5.3c-.3.4-.3.9 0 1.3l9.1 10.5v3c-9.4 2.6-16.4 11.2-16.4 21.4 0 12.3 10 22.2 22.2 22.2s22.2-9.9 22.2-22.2c0-10.1-6.9-18.7-16.2-21.3zm-10.3-4.4-7.7-8.8h6.5l2.6 8.8zm3.5 0-2.6-8.8h6.8l-2.4 8.8zm-2.9-10.8v-3.3h7.4v3.3zm9.3 2h6.4l-7.5 8.8h-1.4zm6.3-2h-6.1v-3.3h3.2zm-20.8-3.3h3.3v3.3h-6.2zm5.1 16.1h7.8v1.9c-1.3-.2-2.6-.4-4-.4-1.3 0-2.6.1-3.8.3zm3.8 43.9c-11.1 0-20.2-9.1-20.2-20.2s9.1-20.2 20.2-20.2 20.2 9.1 20.2 20.2-9.1 20.2-20.2 20.2z"/></g>
    </svg>
  );
}

function FreelancerIcon({ className }: IconProps) {
  return (
    <svg width="100%" viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true" fill="currentColor">
      <g><path d="m63.1 58h-6v-16.2c0-3-2.1-5.5-5-6l-13.3-2.5c0-.1 0-.2 0-.3v-1.5c5.4-3.2 9.1-10.4 9.1-16.6.1-8.1-6.6-13.9-14.9-13.9-8.6 0-15 6-15 13.9 0 6.2 3.8 13.4 9.1 16.6v1.5.3l-13.3 2.5c-2.9.5-5 3.1-5 6v16.2h-6c-.6 0-1 .4-1 1v5c0 .6.4 1 1 1h60.2c.6 0 1-.4 1-1v-5c.1-.5-.4-1-.9-1zm-17.1-43.1c0 .7-.1 1.5-.2 2.2-3.7-.3-6.9-2.9-8-6.5 1.2-1.8 1.9-3.8 2.2-5.9 3.7 2 6 5.7 6 10.2zm-13-11.9c1.8 0 3.5.3 5 .8-.4 7.4-8.2 13.3-17.8 13.6-.1-.9-.2-1.7-.2-2.5 0-6.9 5.5-11.9 13-11.9zm-12.3 16.4c6.5-.3 12.2-3 15.7-6.9 1.6 3.6 5.1 6.2 9.1 6.6-1.7 6.2-6.7 12.1-12.4 12.1s-10.7-5.7-12.4-11.8zm16.2 13.1v.5c0 2.1-1.7 3.9-3.9 3.9-2.1 0-3.9-1.7-3.9-3.9v-.6c2.6 1 5.2 1 7.8.1zm-26 9.3c0-2 1.4-3.7 3.4-4l13.3-2.5c2 4.8 8.8 4.8 10.8 0l13.3 2.5c2 .4 3.4 2.1 3.4 4v16.2h-8.8v-.1l3.8-13.6c.5-1.8-.9-3.6-2.8-3.6h-28.7c-1.9 0-3.3 1.8-2.8 3.6l3.8 13.6v.1h-8.8v-16.2zm10.6 15.6-3.8-13.6c-.2-.6.3-1.1.8-1.1h28.8c.6 0 1 .6.8 1.1l-3.8 13.6c.1.3-.3.6-.7.6h-21.2c-.4 0-.8-.3-.9-.6zm40.6 5.6h-58.2v-3h58.2z"/><path d="m33 46c-3.3 0-5.9 1.9-5.9 4.3s2.6 4.3 5.9 4.3 5.9-1.9 5.9-4.3-2.6-4.3-5.9-4.3zm0 6.6c-2.1 0-3.9-1.1-3.9-2.3 0-1.3 1.8-2.3 3.9-2.3s3.9 1.1 3.9 2.3c0 1.3-1.8 2.3-3.9 2.3z"/></g>
    </svg>
  );
}

function AIResearcherIcon({ className }: IconProps) {
  return (
    <svg width="100%" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true" fill="currentColor">
      <path d="m436.393 115.97c-24.383-19.416-57.096-30.109-92.111-30.109-59.224 0-124.564 32.746-133.58 104.365-10.253-3.328-21.185-5.135-32.533-5.135-58.225 0-105.594 47.37-105.594 105.595 0 19.011 5.111 37.651 14.781 53.907 2.068 3.477 1.849 7.64-.442 10.808-5.97-1.939-12.795-.557-17.528 4.178l-57.146 57.145c-10.996 10.998-10.996 28.893 0 39.889 5.499 5.5 12.722 8.249 19.945 8.249s14.446-2.75 19.944-8.247 57.145-57.146 57.145-57.146c4.735-4.734 6.117-11.557 4.178-17.527 3.169-2.292 7.331-2.51 10.809-.444 16.257 9.67 34.897 14.781 53.906 14.781 38.701 0 72.6-20.932 90.987-52.065 2.909 8.271 4.307 16.52 4.307 25.256v29.521c0 9.5 6.291 17.557 14.925 20.229v13.833c0 11.675 9.498 21.173 21.172 21.173h2.213v9.876c0 11.675 9.498 21.173 21.172 21.173h22.674c11.675 0 21.173-9.498 21.173-21.173v-9.876h2.212c11.675 0 21.173-9.498 21.173-21.173v-13.833c8.634-2.672 14.925-10.729 14.925-20.229v-20.475-9.046c0-26.381 12.547-43.885 27.075-64.152 17.223-24.028 36.744-51.262 36.744-98.116 0-37.531-14.705-69.078-42.526-91.232zm-337.016 273.601-57.145 57.144c-5.539 5.538-14.552 5.54-20.093 0-5.538-5.539-5.538-14.552 0-20.092l57.145-57.145c.63-.63 1.458-.944 2.285-.944s1.655.314 2.285.944l15.522 15.522c1.26 1.26 1.26 3.311 0 4.57zm78.792-7.291c-16.491 0-32.657-4.431-46.749-12.812-8.524-5.071-18.749-4.439-26.441 1.338l-6.929-6.929c5.776-7.69 6.409-17.916 1.338-26.44-8.382-14.092-12.812-30.258-12.812-46.75 0-50.506 41.089-91.595 91.594-91.595s91.595 41.089 91.595 91.595-41.089 91.594-91.595 91.594zm184.622 81.823c0 3.955-3.218 7.173-7.173 7.173h-22.674c-3.955 0-7.172-3.218-7.172-7.173v-9.876h37.019zm16.212-23.876h-69.443c-3.955 0-7.172-3.218-7.172-7.173v-12.891h83.788v12.891c0 3.955-3.218 7.173-7.173 7.173zm14.925-34.063h-99.292c-3.955 0-7.173-3.217-7.173-7.172v-13.475h113.638v13.475c0 3.955-3.218 7.172-7.173 7.172zm-35.46-34.646h-28.373v-124.984h28.373zm72.328-74.354c-15.271 21.306-29.696 41.429-29.696 72.309v2.046h-28.632v-124.984h1.526c6.746.01 13.709.002 20.291-1.643 11.037-2.758 18.854-9.342 22.008-18.541 3.09-9.01 1.192-19.472-4.951-27.302-7.712-9.828-20.049-13.187-31.437-8.557-18.916 7.694-21.364 27.499-21.436 42.042h-28.377c-.071-14.543-2.52-34.348-21.437-42.042-11.382-4.629-23.725-1.271-31.436 8.557-6.144 7.83-8.041 18.292-4.951 27.302 3.154 9.199 10.971 15.783 22.008 18.541 6.582 1.645 13.539 1.646 20.291 1.643h1.526v124.984h-28.632v-2.046c0-14.694-3.281-28.139-10.292-42.057 4.26-11.444 6.593-23.818 6.593-36.728 0-41.737-24.342-77.894-59.574-95.026 6.241-65.774 65.999-95.8 120.092-95.8 58.103 0 120.638 33.591 120.638 107.342 0 42.355-17.347 66.556-34.123 89.96zm-58.326-64.63c.101-16.786 3.919-25.498 12.71-29.073 2.697-1.097 9.57-2.879 15.148 4.23 3.197 4.075 4.266 9.616 2.722 14.118-1.585 4.624-5.789 7.909-12.157 9.5-4.911 1.227-11.02 1.219-16.896 1.225zm-56.377 0h-1.527c-5.896.018-11.984.002-16.895-1.225-6.368-1.591-10.573-4.876-12.158-9.501-1.544-4.501-.476-10.043 2.722-14.117 3.25-4.142 6.938-5.266 9.985-5.266 2.184 0 4.037.577 5.162 1.035 8.792 3.575 12.61 12.287 12.711 29.073zm-69.631-171.403c-1.933-3.348-.785-7.629 2.562-9.562 3.349-1.931 7.629-.786 9.562 2.562l13.49 23.366c1.933 3.348.785 7.629-2.562 9.562-1.103.636-2.306.938-3.493.938-2.42 0-4.772-1.255-6.069-3.501l-13.49-23.366zm90.819-.426v-26.981c0-3.866 3.134-7 7-7s7 3.134 7 7v26.981c0 3.866-3.134 7-7 7s-7-3.134-7-7zm79.205 16.792 13.491-23.366c1.933-3.347 6.214-4.495 9.562-2.562s4.495 6.214 2.562 9.562l-13.491 23.366c-1.296 2.245-3.649 3.501-6.068 3.501-1.188 0-2.391-.303-3.493-.939-3.348-1.933-4.495-6.214-2.562-9.562zm-234.991 36.152c1.934-3.348 6.215-4.492 9.562-2.562l23.367 13.49c3.348 1.934 4.495 6.214 2.562 9.562-1.297 2.245-3.65 3.501-6.069 3.501-1.188 0-2.391-.303-3.493-.938l-23.367-13.49c-3.348-1.934-4.495-6.214-2.562-9.562zm323.01 9.562-23.366 13.49c-1.103.636-2.306.938-3.493.938-2.42 0-4.772-1.256-6.069-3.501-1.933-3.348-.785-7.629 2.562-9.562l23.366-13.49c3.349-1.932 7.629-.786 9.562 2.562 1.933 3.349.785 7.629-2.562 9.562zm-326.336 90.757c-42.301 0-76.716 34.415-76.716 76.717s34.415 76.716 76.716 76.716 76.717-34.415 76.717-76.716-34.415-76.717-76.717-76.717zm0 139.433c-34.582 0-62.716-28.134-62.716-62.716s28.134-62.717 62.716-62.717 62.717 28.135 62.717 62.717-28.135 62.716-62.717 62.716zm27.139-82.821c0 13.16-7.235 19.676-12.518 24.434-5.005 4.508-7.617 7.146-7.617 13.266 0 3.866-3.134 7-7 7s-7-3.134-7-7c0-12.637 6.791-18.753 12.248-23.668 4.749-4.277 7.887-7.104 7.887-14.031 0-7.245-5.894-13.139-13.139-13.139s-13.138 5.894-13.138 13.139c0 3.866-3.134 7-7 7s-7-3.134-7-7c0-14.964 12.174-27.139 27.138-27.139s27.139 12.175 27.139 27.139zm-20.139 58.582v1.766c0 3.866-3.134 7-7 7s-7-3.134-7-7v-1.766c0-3.866 3.134-7 7-7s7 3.134 7 7z"/>
    </svg>
  );
}

function ContentCreatorIcon({ className }: IconProps) {
  return (
    <svg width="100%" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true" fill="currentColor">
      <g><path d="m20.413 54.476-.371 1.237c-.077.256-.048.532.081.767.128.234.345.408.603.481l3.153.901c1.353.387 2.731.672 4.121.862v4.276h2v-4.07c.665.045 1.332.07 2 .07s1.335-.025 2-.07v4.07h2v-4.275c1.391-.19 2.768-.476 4.121-.862l3.153-.901c.258-.073.475-.247.603-.481.129-.235.158-.511.081-.767l-.371-1.237c9.994-4.546 16.413-14.438 16.413-25.477 0-15.439-12.561-28-28-28s-28 12.561-28 28c0 11.039 6.419 20.931 16.413 25.476zm19.159 1.463c-4.928 1.407-10.217 1.407-15.145 0l-2.179-.623 2.447-8.158 1.166.233c4.035.807 8.24.807 12.275 0l1.166-.233 2.447 8.158zm1.386-10.226c-.148-.495-.648-.794-1.154-.693l-2.059.412c-3.775.755-7.715.755-11.49 0l-2.059-.412c-.507-.101-1.006.199-1.154.693l-.01.034c-6.128-3.29-10.032-9.738-10.032-16.747 0-10.477 8.523-19 19-19s19 8.523 19 19c0 7.009-3.904 13.457-10.032 16.747zm-8.958-42.713c14.337 0 26 11.664 26 26 0 10.159-5.854 19.272-14.993 23.543l-1.456-4.852c6.979-3.573 11.449-10.809 11.449-18.691 0-11.58-9.421-21-21-21s-21 9.42-21 21c0 7.882 4.47 15.118 11.448 18.691l-1.456 4.852c-9.138-4.271-14.992-13.384-14.992-23.543 0-14.336 11.663-26 26-26z"/></g>
    </svg>
  );
}

function OtherIcon({ className }: IconProps) {
  return (
    <svg width="100%" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <path fill="currentColor" d="M32,0c-17.6730843,0-32,14.3268995-32,32s14.3269148,32,32,32s32-14.3269005,32-32S49.6730995,0,32,0z M32,62c-16.5419998,0-30-13.457901-30-30c0-16.5419998,13.4579992-30,30-30c16.542099,0,30,13.4580002,30,30C62,48.542099,48.542099,62,32,62z"/>
      <path fill="currentColor" d="M18,27c-2.7613993,0-4.999999,2.2385998-4.999999,5S15.2386007,37,18,37s5-2.2386017,5-5S20.7614002,27,18,27z M18,35c-1.6541996,0-3-1.3456993-3-3c0-1.6541996,1.3458004-3,3-3c1.6543007,0,3,1.3458004,3,3C21,33.6543007,19.6543007,35,18,35z"/>
      <path fill="currentColor" d="M32,27c-2.7614002,0-5,2.2385998-5,5s2.2385998,5,5,5s5-2.2386017,5-5S34.7613983,27,32,27z M32,35c-1.6541996,0-3-1.3456993-3-3c0-1.6541996,1.3458004-3,3-3c1.6543007,0,3,1.3458004,3,3C35,33.6543007,33.6543007,35,32,35z"/>
      <path fill="currentColor" d="M46,27c-2.7614021,0-5,2.2385998-5,5s2.2385979,5,5,5c2.7613983,0,5-2.2386017,5-5S48.7613983,27,46,27z M46,35c-1.6542015,0-3-1.3456993-3-3c0-1.6541996,1.3457985-3,3-3c1.6543007,0,3,1.3458004,3,3C49,33.6543007,47.6543007,35,46,35z"/>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Role options
// ---------------------------------------------------------------------------

const ROLE_OPTIONS: { value: UserType; label: string; Icon: (p: IconProps) => JSX.Element }[] = [
  { value: 'jewelry_brand',      label: 'Jewelry Brand',        Icon: JewelryBrandIcon   },
  { value: 'freelancer',         label: 'Freelancer',           Icon: FreelancerIcon     },
  { value: 'researcher_student', label: 'Researcher / Student', Icon: AIResearcherIcon   },
  { value: 'content_creator',    label: 'Content Creator',      Icon: ContentCreatorIcon },
  { value: 'other',              label: 'Other',                Icon: OtherIcon          },
];

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

interface RoleCardProps {
  value: UserType;
  label: string;
  Icon: (p: IconProps) => JSX.Element;
  selected: boolean;
  onSelect: () => void;
}

function RoleCard({ label, Icon, selected, onSelect }: RoleCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'relative flex aspect-square w-full flex-col items-center justify-center gap-3 sm:gap-4',
        'overflow-hidden border-2 p-4 sm:p-6 lg:p-8',
        'transition-all duration-200 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        selected
          ? 'border-primary bg-primary/5 scale-[1.02] shadow-sm'
          : 'border-border bg-card hover:border-primary/40 hover:bg-accent/20',
      )}
    >
      {selected && (
        <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
          <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />
        </span>
      )}
      <Icon className="h-20 w-20 text-primary sm:h-32 sm:w-32 lg:h-40 lg:w-40" />
      <span className={cn(
        'line-clamp-2 w-full text-center text-[10px] font-medium leading-tight sm:text-xs',
        selected ? 'text-foreground' : 'text-muted-foreground',
      )}>
        {label}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RolePicker() {
  const { user, initializing } = useAuth();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<UserType | null>(null);
  const [tosChecked, setTosChecked] = useState(false);
  const [shakeRole, setShakeRole] = useState(false);
  const [shakeTos, setShakeTos] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [tosError, setTosError] = useState<string | null>(null);
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [brandDetails, setBrandDetails] = useState<BrandDetails | null>(null);
  const shakeRoleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shakeTosTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerShake = (type: 'role' | 'tos') => {
    if (type === 'role') {
      if (shakeRoleTimer.current) clearTimeout(shakeRoleTimer.current);
      setShakeRole(true);
      shakeRoleTimer.current = setTimeout(() => setShakeRole(false), 600);
    } else {
      if (shakeTosTimer.current) clearTimeout(shakeTosTimer.current);
      setShakeTos(true);
      shakeTosTimer.current = setTimeout(() => setShakeTos(false), 600);
    }
  };

  useEffect(() => {
    if (initializing) return;
    if (user && isOnboardingComplete(user.id)) {
      navigate('/studio', { replace: true });
    }
  }, [user, initializing, navigate]);

  const handleContinue = async () => {
    if (!selected) { triggerShake('role'); setRoleError('Please select one to continue.'); return; }
    if (!tosChecked) { triggerShake('tos'); setTosError('Please agree to the Terms of Service.'); return; }
    if (!user || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await saveUserType(selected, selected === 'jewelry_brand' ? brandDetails : null);
      setCachedUserType(user.id, selected);
      trackUserTypeSelected({ user_type: selected });
      if (selected === 'jewelry_brand' && brandDetails) {
        toast({
          title: 'Saved',
          description: 'You can always edit or delete these details later from your profile menu.',
        });
      }
      markOnboardingComplete(user.id);
      navigate('/studio', { replace: true });
    } catch {
      setSubmitting(false);
      setError('Something went wrong. Please try again.');
    }
  };

  return (
    <>
    <JewelryBrandModal
      source="onboarding"
      open={showBrandModal}
      onClose={() => setShowBrandModal(false)}
      onContinue={(details) => { setBrandDetails(details); setShowBrandModal(false); }}
      initial={brandDetails ?? undefined}
    />
    <div className="flex h-screen flex-col items-center justify-center overflow-hidden px-5 py-8 sm:px-10 sm:py-10 lg:px-16 lg:py-12">
      <div className="w-full shrink-0 pb-6 text-center sm:pb-8">
        <h1 className="font-display text-3xl leading-tight tracking-wide sm:text-4xl lg:text-5xl">
          What best describes you?
        </h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          Help us personalize your FormaNova experience
        </p>
      </div>

      <div className={cn(
        'grid w-full max-w-md grid-cols-2 gap-5 sm:max-w-3xl sm:gap-6 lg:max-w-7xl lg:grid-cols-5 lg:gap-8',
        shakeRole && 'animate-[shake_0.3s_ease-in-out]',
      )}>
        {ROLE_OPTIONS.map((option) => (
          <RoleCard
            key={option.value}
            {...option}
            selected={selected === option.value}
            onSelect={() => {
              setSelected(option.value);
              setRoleError(null);
              if (option.value === 'jewelry_brand') setShowBrandModal(true);
            }}
          />
        ))}
      </div>
      {roleError && (
        <p className="mt-2 text-sm text-destructive text-center">{roleError}</p>
      )}

      {/* ToS checkbox */}
      <div className="w-full shrink-0 pt-5 sm:pt-6 flex flex-col items-center gap-1.5">
        <button
          type="button"
          onClick={() => { setTosChecked(c => !c); setTosError(null); }}
          className={cn(
            'inline-flex items-start gap-3 focus:outline-none group',
            shakeTos && 'animate-[shake_0.3s_ease-in-out]',
          )}
        >
          <div className={cn(
            'mt-0.5 h-5 w-5 shrink-0 border-2 flex items-center justify-center transition-colors',
            tosChecked
              ? 'bg-primary border-primary'
              : shakeTos
                ? 'bg-background border-destructive'
                : 'bg-background border-foreground group-hover:border-primary',
          )}>
            {tosChecked && (
              <svg className="h-3 w-3 text-primary-foreground" viewBox="0 0 10 8" fill="none">
                <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          <span className={cn(
            'text-base leading-snug text-left font-semibold',
            shakeTos && !tosChecked ? 'text-destructive' : 'text-foreground',
          )}>
            I agree to the{' '}
            <a
              href="https://formanova.ai/terms/"
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="inline-flex items-center gap-1 underline underline-offset-2 hover:opacity-70 transition-opacity"
            >
              Terms of Service
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            </a>
          </span>
        </button>
        {tosError && (
          <p className="text-sm text-destructive">{tosError}</p>
        )}
      </div>

      <div className="w-full shrink-0 pt-4 pb-4 flex flex-col items-center sm:pt-5 sm:pb-8">
        {error && (
          <p className="mb-3 text-center text-sm text-destructive">{error}</p>
        )}
        <Button
          className="min-w-[200px] px-10"
          size="lg"
          disabled={submitting}
          onClick={handleContinue}
        >
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitting ? 'Continuing…' : 'Continue'}
        </Button>
      </div>

    </div>
    </>
  );
}

import { motion, useScroll, useTransform, useSpring, useMotionValue, useMotionTemplate, AnimatePresence } from 'motion/react';
import { ArrowRight, Shield, Zap, Coins, ChevronRight, Activity, Lock, Layers, Code, CheckCircle2, Search, Filter, Plus, X, Wallet, TrendingUp, Users, Clock, ArrowUpRight, ArrowDownRight, Unlock, PieChart, Mail } from 'lucide-react';
import { useRef, useEffect, useState, Suspense, createContext, useContext, useMemo } from 'react';
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, PresentationControls, Environment } from '@react-three/drei';
import * as THREE from 'three';
import Lenis from 'lenis';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { api, ApiError, FACEBOOK_APP_ID, GOOGLE_CLIENT_ID, type AuthUser, type CampaignDetail, type CampaignSummary, type SocialProvider, type UserVerification } from './api';
import equifundMark from './assets/equifund-mark.svg';

const TOKEN_KEY = 'stellaris.original.token';
const money = (value: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: value >= 100 ? 0 : 2
  }).format(value);
const compactMoney = (value: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value);
const daysLeft = (isoDate: string) => Math.max(0, Math.ceil((new Date(isoDate).getTime() - Date.now()) / 86400000));
const niceStatus = (value: string) => value.toLowerCase().split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ');
const relativeDays = (isoDate: string) => {
  const delta = Math.round((new Date(isoDate).getTime() - Date.now()) / 86400000);
  return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(delta, 'day');
};
const detectRegion = (): 'INDIA' | 'GLOBAL' => {
  if (typeof window === 'undefined') {
    return 'GLOBAL';
  }

  const locale = Intl.DateTimeFormat().resolvedOptions().locale?.toUpperCase() ?? '';
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';

  if (locale.endsWith('-IN') || timeZone === 'Asia/Kolkata' || timeZone === 'Asia/Calcutta') {
    return 'INDIA';
  }

  return 'GLOBAL';
};

const loadScript = async (src: string, selector: string) => {
  if (typeof window === 'undefined') {
    throw new Error('This action is only available in the browser.');
  }

  const existing = document.querySelector<HTMLScriptElement>(selector);
  if (existing) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });
};

const EquifundLogo = ({
  size = 34,
  showWordmark = true,
  stacked = false,
  className = ''
}: {
  size?: number;
  showWordmark?: boolean;
  stacked?: boolean;
  className?: string;
}) => (
  <div
    className={[
      'flex items-center text-white',
      stacked ? 'flex-col justify-center gap-4 text-center' : 'gap-3',
      className
    ].join(' ')}
  >
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="absolute inset-[-18%] rounded-[28%] bg-white/10 blur-xl opacity-80" />
      <img
        src={equifundMark}
        alt="Equifund logo"
        className="relative h-full w-full object-contain drop-shadow-[0_0_24px_rgba(255,255,255,0.14)]"
      />
    </div>
    {showWordmark ? (
      <div className={stacked ? 'text-[13px] tracking-[0.52em] text-white/58 pl-[0.52em]' : 'text-lg font-semibold tracking-[0.12em] text-white/92'}>
        {stacked ? 'EQUIFUND' : 'Equifund'}
      </div>
    ) : null}
  </div>
);

const getGoogleAccessToken = async () => {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('Google sign-in is not configured. Add VITE_GOOGLE_CLIENT_ID to the frontend env.');
  }

  await loadScript('https://accounts.google.com/gsi/client', 'script[src="https://accounts.google.com/gsi/client"]');

  if (!window.google?.accounts?.oauth2) {
    throw new Error('Google Identity Services failed to initialize.');
  }

  return new Promise<string>((resolve, reject) => {
    const tokenClient = window.google?.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'openid email profile',
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description || response.error || 'Google sign-in failed.'));
          return;
        }

        resolve(response.access_token);
      }
    });

    tokenClient.requestAccessToken({
      prompt: 'consent'
    });
  });
};

const getFacebookAccessToken = async () => {
  if (!FACEBOOK_APP_ID) {
    throw new Error('Facebook sign-in is not configured. Add VITE_FACEBOOK_APP_ID to the frontend env.');
  }

  await loadScript('https://connect.facebook.net/en_US/sdk.js', 'script[src="https://connect.facebook.net/en_US/sdk.js"]');

  if (!window.FB) {
    throw new Error('Facebook SDK failed to initialize.');
  }

  await new Promise<void>((resolve) => {
    window.fbAsyncInit = () => {
      window.FB?.init({
        appId: FACEBOOK_APP_ID,
        cookie: true,
        xfbml: false,
        version: 'v23.0'
      });
      resolve();
    };

    if (window.FB?.init) {
      window.fbAsyncInit();
    }
  });

  return new Promise<string>((resolve, reject) => {
    window.FB?.login((response) => {
      const accessToken = response.authResponse?.accessToken;
      if (!accessToken) {
        reject(new Error('Facebook sign-in was cancelled or failed.'));
        return;
      }

      resolve(accessToken);
    }, { scope: 'public_profile,email' });
  });
};

// --- Auth Context ---
interface AuthContextType {
  ready: boolean;
  token: string | null;
  user: AuthUser | null;
  verification: UserVerification | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithProvider: (provider: SocialProvider) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [verification, setVerification] = useState<UserVerification | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const boot = async () => {
      if (!token) {
        setReady(true);
        return;
      }

      try {
        const me = await api.me(token);
        setUser(me.user);
        setVerification(me.verification);
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
      } finally {
        setReady(true);
      }
    };

    void boot();
  }, [token]);

  const login = async (email: string, password: string) => {
    const auth = await api.login(email, password);
    localStorage.setItem(TOKEN_KEY, auth.token);
    setToken(auth.token);
    setUser(auth.user);
    const me = await api.me(auth.token);
    setVerification(me.verification);
  };

  const loginWithProvider = async (provider: SocialProvider) => {
    const auth = await (async () => {
      if (provider === 'GOOGLE') {
        const accessToken = await getGoogleAccessToken();
        return api.googleLogin(accessToken, 'BACKER');
      }

      if (provider === 'FACEBOOK') {
        const accessToken = await getFacebookAccessToken();
        return api.facebookLogin(accessToken, 'BACKER');
      }

      return api.socialLogin({
        provider,
        providerUserId: 'apple.backer@stellaris.dev',
        email: 'apple.backer@stellaris.dev',
        fullName: 'Apple Backer',
        role: 'BACKER'
      });
    })();

    localStorage.setItem(TOKEN_KEY, auth.token);
    setToken(auth.token);
    setUser(auth.user);
    const me = await api.me(auth.token);
    setVerification(me.verification);
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setVerification(null);
  };

  return (
    <AuthContext.Provider value={{ ready, token, user, verification, isAuthenticated: Boolean(user), login, loginWithProvider, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// --- Protected Route ---
const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { ready, isAuthenticated } = useAuth();
  const location = useLocation();

  if (!ready) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-14 h-14 border-4 border-white/10 border-t-white rounded-full animate-spin" />
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  return <>{children}</>;
};

// --- Login Page ---
function LoginPage() {
  const { login, loginWithProvider, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('founder@stellaris.dev');
  const [password, setPassword] = useState('secret-pass-founder');
  const [error, setError] = useState<string | null>(null);
  const providerOptions: Array<{
    provider: SocialProvider;
    label: string;
    configured: boolean;
    hint: string;
  }> = [
    {
      provider: 'GOOGLE',
      label: 'Continue with Google',
      configured: Boolean(GOOGLE_CLIENT_ID),
      hint: GOOGLE_CLIENT_ID ? 'Opens the Google account chooser.' : 'Google sign-in is not configured yet.'
    },
    {
      provider: 'APPLE',
      label: 'Continue with Apple',
      configured: true,
      hint: 'Apple is still running in local demo mode.'
    }
  ];

  const from = location.state?.from?.pathname || "/explore";

  useEffect(() => {
    if (user) {
      navigate(from, { replace: true });
    }
  }, [from, navigate, user]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJudgeDemo = async (mode: 'founder' | 'investor') => {
    setIsLoading(true);
    setError(null);
    try {
      if (mode === 'founder') {
        await login('founder@stellaris.dev', 'secret-pass-founder');
        navigate('/founder', { replace: true });
      } else {
        await login('backer1@stellaris.dev', 'secret-pass-backer1');
        navigate('/investor', { replace: true });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to launch the judge demo.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleProviderLogin = async (provider: SocialProvider) => {
    const providerOption = providerOptions.find((item) => item.provider === provider);
    if (providerOption && !providerOption.configured) {
      setError(providerOption.hint);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await loginWithProvider(provider);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in with provider.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black relative overflow-hidden pt-28 pb-16 px-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_28%)] pointer-events-none" />
      <div className="absolute left-1/2 top-24 h-40 w-[28rem] -translate-x-1/2 rounded-full bg-white/[0.06] blur-[130px] pointer-events-none" />
      <div className="absolute inset-0 bg-grid-white mask-radial-faded opacity-15 pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-[470px] mx-auto border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] shadow-[0_40px_120px_rgba(0,0,0,0.6)] backdrop-blur-xl px-8 py-10 md:px-10 md:py-12 relative overflow-hidden"
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.09),transparent_34%)] pointer-events-none" />

        <div className="flex justify-center mb-6">
          <div className="w-9 h-9 border border-white/20 rounded-full flex items-center justify-center text-white/70 text-sm">
            •
          </div>
        </div>

        <div className="mb-10">
          <EquifundLogo size={84} stacked className="mx-auto" />
        </div>

        <div className="text-center mb-10">
          <h1 className="text-5xl font-bold tracking-tight mb-3">Welcome back</h1>
          <p className="text-gray-400 text-lg">Sign in to access the platform</p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <button
            type="button"
            onClick={() => void handleJudgeDemo('investor')}
            disabled={isLoading}
            className="border border-white/10 bg-white/[0.03] px-4 py-4 text-white font-semibold hover:bg-white/[0.06] transition-colors disabled:opacity-70"
          >
            Demo Investor
          </button>
          <button
            type="button"
            onClick={() => void handleJudgeDemo('founder')}
            disabled={isLoading}
            className="border border-white/10 bg-white/[0.03] px-4 py-4 text-white font-semibold hover:bg-white/[0.06] transition-colors disabled:opacity-70"
          >
            Demo Founder
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-8">
          {providerOptions.map((item) => (
            <button
              key={item.provider}
              type="button"
              onClick={() => void handleProviderLogin(item.provider)}
              disabled={isLoading || !item.configured}
              className="border border-white/10 bg-white/[0.03] px-4 py-4 text-white font-semibold hover:bg-white/[0.06] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center justify-center gap-3">
                <span>{item.provider === 'GOOGLE' ? 'G' : 'Apple'}</span>
                <span>{item.provider === 'GOOGLE' ? 'Google' : 'Apple'}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="mb-8 flex items-center gap-4 text-[12px] uppercase tracking-[0.28em] text-gray-500">
          <div className="h-px flex-1 bg-white/10" />
          <span>Or continue with email</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-400">Email address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full border border-white/10 bg-white/[0.03] px-5 py-4 text-white focus:outline-none focus:border-white/25 focus:bg-white/[0.05] transition-colors"
              placeholder="founder@equifund.app"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-400">Password</label>
              <span className="text-sm text-gray-500">Forgot?</span>
            </div>
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full border border-white/10 bg-white/[0.03] px-5 py-4 text-white focus:outline-none focus:border-white/25 focus:bg-white/[0.05] transition-colors"
              placeholder="••••••••••"
            />
          </div>

          {error && (
            <div className="border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-white text-black font-medium px-5 py-4 transition-colors duration-300 hover:bg-neutral-200 disabled:opacity-70 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full"
              />
            ) : (
              <>Sign In</>
            )}
          </button>
        </form>

        <div className="mt-10 text-center text-sm text-gray-500">
          Don&apos;t have an account? <span className="text-white font-medium">Request access</span>
        </div>
      </motion.div>
    </div>
  );
}

// --- Magnetic Button Component ---
const MagneticButton = ({ children, className = "", ...props }: any) => {
  const ref = useRef<HTMLButtonElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const handleMouse = (e: ReactMouseEvent<HTMLButtonElement>) => {
    const { clientX, clientY } = e;
    const { height, width, left, top } = ref.current!.getBoundingClientRect();
    const middleX = clientX - (left + width / 2);
    const middleY = clientY - (top + height / 2);
    x.set(middleX * 0.2);
    y.set(middleY * 0.2);
  };

  const reset = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.button
      ref={ref}
      onMouseMove={handleMouse}
      onMouseLeave={reset}
      animate={{ x: x.get(), y: y.get() }}
      transition={{ type: "spring", stiffness: 150, damping: 15, mass: 0.1 }}
      className={className}
      {...props}
    >
      {children}
    </motion.button>
  );
};

// --- Central Focal Point: Premium Dark Metal Core ---
const PremiumEscrowCore = () => {
  const groupRef = useRef<THREE.Group>(null);
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (groupRef.current) {
      groupRef.current.rotation.y = t * 0.15;
      groupRef.current.rotation.x = Math.sin(t * 0.1) * 0.2;
    }
    if (ring1Ref.current) {
      ring1Ref.current.rotation.x = Math.PI / 2 + Math.sin(t * 0.2) * 0.1;
      ring1Ref.current.rotation.y = t * -0.1;
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.x = Math.PI / 2 + Math.cos(t * 0.15) * 0.15;
      ring2Ref.current.rotation.y = t * 0.05;
    }
  });

  return (
    <group>
      <Float speed={1.5} rotationIntensity={0.5} floatIntensity={1}>
        <group ref={groupRef}>
          {/* Central Abstract Shape - Smooth Dark Metal Torus Knot */}
          <mesh>
            <torusKnotGeometry args={[1.2, 0.35, 128, 32]} />
            <meshPhysicalMaterial
              color="#050505"
              metalness={1}
              roughness={0.1}
              clearcoat={1}
              clearcoatRoughness={0.1}
              envMapIntensity={2}
            />
          </mesh>
        </group>

        {/* Orbiting Minimalist Rings */}
        <mesh ref={ring1Ref}>
          <torusGeometry args={[2.6, 0.005, 16, 100]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.15} />
        </mesh>
        <mesh ref={ring2Ref}>
          <torusGeometry args={[3.0, 0.005, 16, 100]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.08} />
        </mesh>
      </Float>
    </group>
  );
};

const Particles = () => {
  const pointsRef = useRef<THREE.Points>(null);
  const [positions] = useState(() => {
    const pos = new Float32Array(300 * 3);
    for (let i = 0; i < 300; i++) {
      const r = 4 + Math.random() * 3;
      const theta = 2 * Math.PI * Math.random();
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    return pos;
  });

  useFrame((state, delta) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y -= delta * 0.05;
      pointsRef.current.rotation.x -= delta * 0.02;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial size={0.015} color="#ffffff" transparent opacity={0.3} sizeAttenuation={true} />
    </points>
  );
};

const Hero3D = ({ scrollYProgress }: { scrollYProgress: any }) => {
  const smoothProgress = useSpring(scrollYProgress, { damping: 30, stiffness: 50, mass: 1 }) as any;
  
  const scale = useTransform(smoothProgress, [0, 0.5], [1, 0.7]);
  const y = useTransform(smoothProgress, [0, 1], [0, -300]);
  const opacity = useTransform(smoothProgress, [0, 0.3], [1, 0]);
  const rotate = useTransform(smoothProgress, [0, 1], [0, 15]);

  return (
    <motion.div 
      style={{ scale, y, opacity, rotate }}
      className="fixed top-[45%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] flex items-center justify-center z-0 pointer-events-none"
    >
      <Canvas 
        camera={{ position: [0, 0, 8], fov: 45 }} 
        className="pointer-events-auto cursor-grab active:cursor-grabbing"
        dpr={[1, 1.5]}
        performance={{ min: 0.5 }}
        gl={{ antialias: false, powerPreference: "high-performance" }}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.2} />
          <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={2} color="#ffffff" />
          <spotLight position={[-10, -10, -10]} angle={0.15} penumbra={1} intensity={0.5} color="#ffffff" />
          <Environment preset="studio" />
          <Particles />
          <PresentationControls 
            global={false}
            rotation={[0, 0.3, 0]} 
            polar={[-Math.PI / 3, Math.PI / 3]} 
            azimuth={[-Math.PI / 1.4, Math.PI / 2]}
          >
            <PremiumEscrowCore />
          </PresentationControls>
        </Suspense>
      </Canvas>
    </motion.div>
  );
};

// --- 3D Tilt Bento Card ---
const TiltCard = ({ children, className = "", delay = 0 }: any) => {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const rotateX = useTransform(y, [-0.5, 0.5], ["5deg", "-5deg"]);
  const rotateY = useTransform(x, [-0.5, 0.5], ["-5deg", "5deg"]);

  function handleMouseMove(event: ReactMouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseXPos = event.clientX - rect.left;
    const mouseYPos = event.clientY - rect.top;
    
    const xPct = mouseXPos / width - 0.5;
    const yPct = mouseYPos / height - 0.5;
    
    x.set(xPct);
    y.set(yPct);
    mouseX.set(mouseXPos);
    mouseY.set(mouseYPos);
  }

  function handleMouseLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.div
      style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
      className={`glass-panel rounded-3xl p-10 relative group perspective-[1000px] ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Hover Spotlight */}
      <motion.div
        className="pointer-events-none absolute -inset-px rounded-3xl opacity-0 transition duration-500 group-hover:opacity-100 z-0"
        style={{
          background: useMotionTemplate`
            radial-gradient(
              600px circle at ${mouseX}px ${mouseY}px,
              rgba(255,255,255,0.08),
              transparent 80%
            )
          `,
        }}
      />
      <div className="relative z-10 h-full flex flex-col" style={{ transform: "translateZ(30px)" }}>
        {children}
      </div>
    </motion.div>
  );
};

// --- Custom Cursor ---
const CustomCursor = () => {
  const cursorX = useMotionValue(-100);
  const cursorY = useMotionValue(-100);

  useEffect(() => {
    const moveCursor = (e: MouseEvent) => {
      cursorX.set(e.clientX - 16);
      cursorY.set(e.clientY - 16);
    };
    window.addEventListener('mousemove', moveCursor);
    return () => window.removeEventListener('mousemove', moveCursor);
  }, []);

  return (
    <motion.div
      className="fixed top-0 left-0 w-8 h-8 border border-white/30 rounded-full pointer-events-none z-[100] mix-blend-difference hidden md:block"
      style={{ x: cursorX, y: cursorY }}
      transition={{ type: "spring", stiffness: 500, damping: 28, mass: 0.5 }}
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 bg-white rounded-full" />
    </motion.div>
  );
};

// --- Navbar Component ---
const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const { isAuthenticated, logout, user } = useAuth();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <motion.nav 
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${scrolled ? 'bg-black/70 backdrop-blur-2xl border-b border-white/10 py-4 shadow-2xl' : 'bg-transparent py-6 border-b border-transparent mix-blend-difference'}`}
    >
      <Link to="/" className="cursor-pointer group">
        <EquifundLogo
          size={30}
          className="transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.03]"
        />
      </Link>
      <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-400">
        {['Protocol', 'Yield', 'Governance'].map((item) => (
          <Link key={item} to="/" className="relative text-gray-400 hover:text-white transition-colors duration-300 group py-2">
            {item}
            <span className="absolute bottom-0 left-0 w-0 h-[1px] bg-white transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:w-full" />
          </Link>
        ))}
        <Link to="/founder" className="relative text-gray-400 hover:text-white transition-colors duration-300 group py-2">
          Founder Hub
          <span className="absolute bottom-0 left-0 w-0 h-[1px] bg-white transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:w-full" />
        </Link>
        <Link to="/investor" className="relative text-gray-400 hover:text-white transition-colors duration-300 group py-2">
          Investor Hub
          <span className="absolute bottom-0 left-0 w-0 h-[1px] bg-white transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:w-full" />
        </Link>
        <Link to="/pricing" className="relative text-gray-400 hover:text-white transition-colors duration-300 group py-2">
          Pricing
          <span className="absolute bottom-0 left-0 w-0 h-[1px] bg-white transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:w-full" />
        </Link>
      </div>
      <div className="flex items-center gap-4">
        {isAuthenticated ? (
          <>
            <span className="hidden lg:inline text-xs font-medium uppercase tracking-[0.2em] text-gray-500">
              {user?.role}
            </span>
            <button onClick={logout} className="text-sm font-medium text-gray-400 hover:text-white transition-colors">
              Sign Out
            </button>
            <Link to="/explore">
              <MagneticButton className="px-5 py-2.5 text-sm font-medium bg-white text-black rounded-full hover:scale-105 hover:shadow-[0_0_20px_rgba(255,255,255,0.3)] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-pointer">
                Go to App
              </MagneticButton>
            </Link>
          </>
        ) : (
          <>
            <Link to="/login" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">
              Sign In
            </Link>
            <Link to="/login">
              <MagneticButton className="px-5 py-2.5 text-sm font-medium bg-white text-black rounded-full hover:scale-105 hover:shadow-[0_0_20px_rgba(255,255,255,0.3)] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-pointer">
                Launch App
              </MagneticButton>
            </Link>
          </>
        )}
      </div>
    </motion.nav>
  );
};

// --- Pricing Page ---
function PricingPage() {
  return (
    <div className="min-h-screen pt-40 pb-24 px-4 relative overflow-hidden flex flex-col items-center">
      {/* Background Glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-white/[0.03] blur-[120px] rounded-full pointer-events-none" />
      
      <div className="max-w-5xl w-full relative z-10">
        <div className="text-center mb-20">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
            className="text-5xl md:text-7xl font-bold mb-6 tracking-tight"
          >
            Elevate Your Impact
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}
            className="text-xl text-gray-400 max-w-2xl mx-auto"
          >
            Choose the plan that fits your investment strategy. Premium backers unlock exclusive deal flow and campaign boosting power.
          </motion.p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Free Tier */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}
            className="glass-panel p-10 md:p-12 rounded-[2.5rem] border border-white/10 bg-white/[0.02] flex flex-col"
          >
            <div className="mb-8">
              <h3 className="text-2xl font-bold mb-2">Basic Backer</h3>
              <div className="text-gray-400 mb-6">Essential tools for retail investors.</div>
              <div className="text-5xl font-light tracking-tighter mb-2">Free</div>
              <div className="text-sm text-gray-500">Forever</div>
            </div>
            
            <div className="space-y-4 mb-12 flex-1">
              {[
                'Access to public deal flow',
                'Standard quadratic voting power',
                'Basic portfolio analytics',
                'Community forum access'
              ].map((feature, i) => (
                <div key={i} className="flex items-center gap-3 text-gray-300">
                  <CheckCircle2 className="w-5 h-5 text-white/50 shrink-0" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
            
            <button className="w-full py-4 rounded-2xl border border-white/20 text-white font-medium hover:bg-white/5 transition-colors">
              Current Plan
            </button>
          </motion.div>

          {/* Premium Tier */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.3 }}
            className="glass-panel p-10 md:p-12 rounded-[2.5rem] border border-white/30 bg-white/[0.05] flex flex-col relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/[0.1] blur-[80px] rounded-full pointer-events-none translate-x-1/2 -translate-y-1/2" />
            
            <div className="mb-8 relative z-10">
              <div className="inline-block px-3 py-1 rounded-full bg-white text-black text-xs font-bold uppercase tracking-wider mb-4">
                Recommended
              </div>
              <h3 className="text-2xl font-bold mb-2">Equifund Pro</h3>
              <div className="text-gray-400 mb-6">For serious angel investors & syndicates.</div>
              <div className="text-5xl font-light tracking-tighter mb-2">$49<span className="text-2xl text-gray-500">/mo</span></div>
              <div className="text-sm text-gray-500">Billed annually</div>
            </div>
            
            <div className="space-y-4 mb-12 flex-1 relative z-10">
              {[
                '24hr early access to new deals',
                '1.5x Campaign Boost multiplier for backed founders',
                'Advanced due diligence data room',
                'Priority quadratic voting weight',
                'Direct founder Q&A access'
              ].map((feature, i) => (
                <div key={i} className="flex items-center gap-3 text-white">
                  <CheckCircle2 className="w-5 h-5 text-white shrink-0" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
            
            <MagneticButton className="w-full py-4 rounded-2xl bg-white text-black font-medium hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(255,255,255,0.3)] transition-all duration-300 relative z-10">
              Upgrade to Pro
            </MagneticButton>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

// --- Landing Page ---
function LandingPage() {
  const containerRef = useRef(null);
  const navigate = useNavigate();
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"]
  });

  const y1 = useTransform(scrollYProgress, [0, 0.2], [0, 200]);
  const opacity1 = useTransform(scrollYProgress, [0, 0.15], [1, 0]);
  const scale1 = useTransform(scrollYProgress, [0, 0.2], [1, 0.95]);

  const protocolSteps = [
    {
      step: "01",
      title: "Deploy Smart Contract",
      desc: "Founders define milestones and required funding. Our factory deploys a trustless escrow contract instantly.",
      visual: (
        <div className="w-full h-full min-h-[200px] border border-white/10 rounded-2xl bg-black/50 p-6 font-mono text-sm text-green-400 flex flex-col justify-center relative overflow-hidden shadow-inner">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <span className="text-gray-500">// Initialize Vault</span><br/>
            <span className="text-blue-400">const</span> vault = <span className="text-yellow-300">await</span> EscrowFactory.<span className="text-purple-400">deploy</span>();<br/><br/>
            <span className="text-gray-500">// Set Milestones</span><br/>
            <span className="text-yellow-300">await</span> vault.<span className="text-purple-400">setMilestones</span>([<br/>
            &nbsp;&nbsp;{`{ amount: 50000, desc: "Beta" }`}<br/>
            ]);<br/><br/>
            <span className="text-white">{`> Contract Deployed: 0x4F...9a`}</span>
          </motion.div>
        </div>
      )
    },
    {
      step: "02",
      title: "Fiat-to-Crypto Onramp",
      desc: "Backers pay with credit cards. Stripe processes the fiat, which is instantly converted to USDC and locked in the escrow.",
      visual: (
        <div className="w-full h-full min-h-[200px] border border-white/10 rounded-2xl bg-black/50 p-6 flex flex-col items-center justify-center relative overflow-hidden shadow-inner">
          {/* Subtle background glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-white/5 blur-[50px] rounded-full pointer-events-none" />
          
          <div className="flex items-center gap-4 relative z-10 w-full max-w-[280px] justify-between">
            <motion.div 
              className="w-20 h-28 rounded-xl bg-white/[0.02] border border-white/10 backdrop-blur-md flex flex-col items-center justify-center gap-3 shadow-2xl relative overflow-hidden"
              initial={{ x: -20, opacity: 0 }}
              whileInView={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              <Wallet className="w-6 h-6 text-gray-400" />
              <div className="text-[10px] font-mono text-gray-500 tracking-wider">FIAT</div>
            </motion.div>
            
            <motion.div 
              className="w-10 h-10 rounded-full bg-white/[0.05] border border-white/10 flex items-center justify-center relative overflow-hidden shrink-0"
              initial={{ scale: 0, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <ArrowRight className="w-4 h-4 text-white/70" />
              <motion.div 
                className="absolute inset-0 bg-white/20"
                initial={{ x: "-100%" }}
                whileInView={{ x: "100%" }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
              />
            </motion.div>
            
            <motion.div 
              className="w-20 h-28 rounded-xl bg-white/[0.05] border border-white/20 backdrop-blur-md flex flex-col items-center justify-center gap-3 shadow-[0_0_30px_rgba(255,255,255,0.05)] relative overflow-hidden"
              initial={{ x: 20, opacity: 0 }}
              whileInView={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
              <div className="w-8 h-8 rounded-full border border-white/30 flex items-center justify-center bg-white/5">
                <span className="text-[12px] font-bold text-white">$</span>
              </div>
              <div className="text-[10px] font-mono text-white tracking-wider">USDC</div>
            </motion.div>
          </div>
        </div>
      )
    },
    {
      step: "03",
      title: "Yield Generation",
      desc: "While the founder builds, the global pool is deposited into Aave. The generated yield funds the platform operations.",
      visual: (
        <div className="w-full h-full min-h-[200px] border border-white/10 rounded-2xl bg-black/50 p-6 flex flex-col justify-between relative overflow-hidden shadow-inner">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-32 bg-white/5 blur-[50px] rounded-full pointer-events-none" />
          
          <div className="flex justify-between items-start relative z-10">
            <div className="text-white/40 font-mono text-[10px] uppercase tracking-widest">Global Pool Yield</div>
            <div className="text-white font-mono text-xs bg-white/10 px-2 py-1 rounded border border-white/10 flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-white" />
              +5.4% APY
            </div>
          </div>
          
          <div className="flex items-end gap-1.5 h-24 mt-8 relative z-10">
            {[20, 35, 25, 45, 30, 55, 40, 70, 50, 85, 65, 100].map((h, i) => (
              <motion.div 
                key={i}
                className="flex-1 bg-white/[0.02] rounded-t-sm relative overflow-hidden border-t border-white/10"
                initial={{ height: "10%" }}
                whileInView={{ height: `${h}%` }}
                transition={{ duration: 1, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
              >
                <motion.div 
                  className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-transparent to-white/20"
                  initial={{ height: "0%" }}
                  whileInView={{ height: "100%" }}
                  transition={{ duration: 1.5, delay: i * 0.05 + 0.2, ease: "easeOut" }}
                />
              </motion.div>
            ))}
          </div>
          
          {/* Subtle grid lines */}
          <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6 opacity-10">
            <div className="w-full h-[1px] bg-white mt-12" />
            <div className="w-full h-[1px] bg-white" />
            <div className="w-full h-[1px] bg-white mb-6" />
          </div>
        </div>
      )
    },
    {
      step: "04",
      title: "Proof & Payout",
      desc: "Founder uploads proof to IPFS. Backers vote quadratically. If approved, the liquidity buffer pays the founder instantly.",
      visual: (
        <div className="w-full h-full min-h-[200px] flex flex-col items-center justify-center gap-6">
          <motion.div 
            className="w-24 h-24 rounded-full border-4 border-white/20 flex items-center justify-center relative"
            animate={{ borderColor: ["rgba(255,255,255,0.2)", "rgba(255,255,255,1)", "rgba(255,255,255,0.2)"] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <CheckCircle2 className="w-10 h-10 text-white" />
            <motion.div 
              className="absolute inset-0 rounded-full border-4 border-white"
              initial={{ pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              transition={{ duration: 1.5, ease: "easeInOut" }}
              style={{ borderTopColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: 'transparent' }}
            />
          </motion.div>
          <div className="text-center">
            <div className="text-white font-bold text-xl mb-1">Milestone Approved</div>
            <div className="text-green-400 font-mono text-sm">+$50,000.00 USDC Transferred</div>
          </div>
        </div>
      )
    }
  ];

  return (
    <motion.div 
      ref={containerRef} 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
      className="relative"
    >
      {/* Central Focal Point */}
      <Hero3D scrollYProgress={scrollYProgress} />

      {/* --- Hero Section --- */}
      <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden pt-20 z-10">
        <div className="absolute inset-0 bg-grid-white mask-radial-faded opacity-20 pointer-events-none" />

        <motion.div 
          style={{ y: y1, opacity: opacity1, scale: scale1 }}
          className="container mx-auto px-6 relative z-10 flex flex-col items-center text-center mt-[-15vh]"
        >
          <div className="overflow-hidden mb-4">
            <motion.h1 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
              className="text-6xl md:text-8xl lg:text-[10rem] font-bold tracking-tighter leading-[0.85]"
            >
              Fund the future.
            </motion.h1>
          </div>
          <div className="overflow-hidden mb-8">
            <motion.h1 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              transition={{ duration: 1.2, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
              className="text-6xl md:text-8xl lg:text-[10rem] font-bold tracking-tighter leading-[0.85] text-transparent bg-clip-text bg-gradient-to-b from-white to-white/20"
            >
              Without the fees.
            </motion.h1>
          </div>

          <motion.p 
            initial={{ opacity: 0, filter: "blur(10px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            transition={{ delay: 0.4, duration: 1 }}
            className="max-w-2xl text-lg md:text-xl text-gray-400 font-light mb-12 leading-relaxed"
          >
            The first trustless escrow protocol for creators and backers. 
            Powered by quadratic voting, validator slashing, and DeFi yield generation.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.8 }}
            className="flex flex-col sm:flex-row items-center gap-6 relative z-20"
          >
            <MagneticButton 
              onClick={() => navigate('/create')}
              className="group flex items-center gap-2 px-8 py-4 bg-white text-black rounded-full font-medium text-lg hover:bg-gray-200 transition-colors cursor-pointer"
            >
              Start a Campaign
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </MagneticButton>
            <MagneticButton 
              onClick={() => navigate('/explore')}
              className="px-8 py-4 bg-transparent border border-white/20 text-white rounded-full font-medium text-lg hover:bg-white/5 transition-colors cursor-pointer"
            >
              Explore Projects
            </MagneticButton>
          </motion.div>
        </motion.div>
      </section>

      {/* --- Stats Ticker --- */}
      <section className="relative z-20 border-y border-white/10 bg-black/60 backdrop-blur-2xl py-12">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 divide-x divide-white/10">
            {[
              { label: "Total Value Locked", value: "$42.5M" },
              { label: "Active Campaigns", value: "1,204" },
              { label: "Yield Generated", value: "$1.8M" },
              { label: "Milestones Passed", value: "8,492" },
            ].map((stat, i) => (
              <motion.div 
                key={i} 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                className="flex flex-col items-center text-center px-4"
              >
                <span className="text-3xl md:text-5xl font-mono font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-b from-white to-white/50">{stat.value}</span>
                <span className="text-xs text-gray-500 uppercase tracking-widest font-mono">{stat.label}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* --- Bento Grid Features (Linear Style) --- */}
      <section id="protocol" className="py-40 relative z-20 bg-black">
        <div className="container mx-auto px-6 max-w-7xl">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="mb-24"
          >
            <h2 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">A fundamentally new<br/>economic model.</h2>
            <p className="text-xl text-gray-400 max-w-2xl">We replaced the 5% platform fee with a global DeFi liquidity pool. Creators get 100% of their funds. Backers get absolute accountability.</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Large Feature 1 - FIXED OVERLAP BY USING FLEX ROW */}
            <TiltCard className="md:col-span-2 flex flex-col md:flex-row items-center gap-12 overflow-hidden" delay={0}>
              <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-white/10 transition-colors duration-700" />
              
              <div className="flex-1 relative z-20">
                <Shield className="w-10 h-10 text-white mb-6" />
                <h3 className="text-3xl font-bold mb-4">Smart Contract Escrow</h3>
                <p className="text-gray-400 text-lg">Funds are locked in a trustless vault. Money is only released when creators prove they've hit their milestones. No more vaporware.</p>
              </div>
              
              {/* Abstract UI Mockup - Now a flex sibling, no absolute positioning overlap */}
              <div className="flex-1 w-full relative z-20">
                <div className="w-full bg-black border border-white/10 rounded-2xl p-6 shadow-2xl transform group-hover:-translate-y-2 group-hover:scale-105 transition-all duration-500">
                  <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/10">
                    <span className="font-mono text-sm">Milestone 2: Beta</span>
                    <span className="text-white bg-white/10 px-2 py-1 rounded text-xs">Locked: $30k</span>
                  </div>
                  <div className="space-y-4">
                    <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        whileInView={{ width: "60%" }}
                        transition={{ duration: 1.5, delay: 0.5, ease: "easeOut" }}
                        className="h-full bg-white relative" 
                      >
                        <div className="absolute top-0 right-0 bottom-0 w-10 bg-gradient-to-r from-transparent to-white/50 blur-sm" />
                      </motion.div>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 font-mono">
                      <span>Approval: 60%</span>
                      <span>Quorum: 30%</span>
                    </div>
                    
                    <div className="flex gap-2 pt-4">
                      <div className="h-8 flex-1 bg-white/10 rounded border border-white/5 flex items-center justify-center text-xs text-white/50">Approve</div>
                      <div className="h-8 flex-1 bg-white/5 rounded border border-white/5 flex items-center justify-center text-xs text-white/30">Reject</div>
                    </div>
                  </div>
                </div>
              </div>
            </TiltCard>

            {/* Feature 2 */}
            <TiltCard delay={0.2}>
              <Coins className="w-10 h-10 text-white mb-6" />
              <h3 className="text-2xl font-bold mb-4">Zero Platform Fees</h3>
              <p className="text-gray-400 mb-8">Idle funds are deployed to Aave. The yield pays for the platform. You keep 100% of what you raise.</p>
              
              <div className="mt-auto flex items-end gap-2 h-32 opacity-50 group-hover:opacity-100 transition-opacity">
                {[40, 70, 45, 90, 65, 100].map((h, i) => (
                  <motion.div 
                    key={i} 
                    initial={{ height: 0 }}
                    whileInView={{ height: `${h}%` }}
                    transition={{ duration: 0.5, delay: 0.3 + i * 0.1 }}
                    className="flex-1 bg-white/20 rounded-t-sm relative overflow-hidden"
                  >
                    <motion.div 
                      animate={{ y: ["100%", "0%"] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      className="absolute inset-0 bg-gradient-to-t from-transparent to-white/40" 
                    />
                  </motion.div>
                ))}
              </div>
            </TiltCard>

            {/* Feature 3 */}
            <TiltCard delay={0.1}>
              <Layers className="w-10 h-10 text-white mb-6" />
              <h3 className="text-2xl font-bold mb-4">Quadratic Voting</h3>
              <p className="text-gray-400">Whales can't dictate the outcome. Voting power scales by the square root of investment, capped at 5%.</p>
              <div className="mt-8 flex gap-2 items-end h-16">
                {[1, 2, 3, 4, 5].map((i) => (
                  <motion.div 
                    key={i} 
                    initial={{ height: 10 }}
                    whileInView={{ height: i === 1 ? 64 : 32 }}
                    transition={{ duration: 0.5, delay: i * 0.1 }}
                    className={`rounded-sm ${i === 1 ? 'w-16 bg-white shadow-[0_0_15px_rgba(255,255,255,0.5)]' : 'w-8 bg-white/20'}`} 
                  />
                ))}
              </div>
            </TiltCard>

            {/* Large Feature 4 */}
            <TiltCard className="md:col-span-2 flex flex-col md:flex-row items-center gap-10 overflow-hidden" delay={0.3}>
              <div className="flex-1 z-20">
                <Zap className="w-10 h-10 text-white mb-6" />
                <h3 className="text-3xl font-bold mb-4">Instant Liquidity</h3>
                <p className="text-gray-400 text-lg">When a milestone passes, our liquidity buffer pays out instantly. No waiting 60 days for chargeback clearance.</p>
                <button className="mt-8 flex items-center gap-2 text-sm font-medium hover:text-gray-300 transition-colors group/btn">
                  Read the whitepaper <ChevronRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                </button>
              </div>
              
              <div className="flex-1 w-full relative h-64 flex items-center justify-center z-10">
                <div className="absolute inset-0 flex items-center justify-center">
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                    className="w-64 h-64 border border-dashed border-white/20 rounded-full" 
                  />
                  <motion.div 
                    animate={{ rotate: -360 }}
                    transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                    className="absolute w-40 h-40 border border-white/30 rounded-full" 
                  />
                  <motion.div 
                    whileHover={{ scale: 1.2 }}
                    className="absolute w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(255,255,255,0.6)] cursor-pointer z-30"
                  >
                    <Activity className="w-8 h-8 text-black" />
                  </motion.div>
                  
                  {/* Floating particles */}
                  {[...Array(3)].map((_, i) => (
                    <motion.div
                      key={i}
                      animate={{ y: [-10, 10, -10], opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 3, delay: i, repeat: Infinity }}
                      className="absolute w-2 h-2 bg-white rounded-full"
                      style={{
                        left: `${30 + i * 20}%`,
                        top: `${20 + i * 30}%`
                      }}
                    />
                  ))}
                </div>
              </div>
            </TiltCard>
          </div>
        </div>
      </section>

      {/* --- Sticky Stack Protocol Flow (Dark Mode, Premium Apple/Linear Feel) --- */}
      <section className="py-40 bg-black text-white relative z-20">
        <div className="container mx-auto px-6 max-w-5xl">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-32"
          >
            <h2 className="text-6xl md:text-7xl font-bold tracking-tight mb-6">The Protocol Flow.</h2>
            <p className="text-2xl text-gray-500">A seamless bridge from Web2 payments to Web3 execution.</p>
          </motion.div>

          <div className="relative pb-32">
            {protocolSteps.map((step, i) => (
              <motion.div 
                key={i}
                className="sticky rounded-[2.5rem] border border-white/10 border-t-white/20 p-8 md:p-16 mb-24 min-h-[50vh] flex flex-col md:flex-row items-center gap-12 shadow-[0_-20px_50px_rgba(0,0,0,0.8)] bg-[#050505] overflow-hidden"
                style={{ top: `calc(15vh + ${i * 30}px)` }}
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ margin: "-100px" }}
                transition={{ duration: 0.6 }}
              >
                {/* Controlled internal white glow */}
                <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-white/[0.08] blur-[120px] rounded-full pointer-events-none -translate-x-1/4 -translate-y-1/4" />
                
                <div className="flex-1 w-full relative z-10">
                  <span className="text-8xl md:text-9xl font-bold text-white/10 absolute top-8 left-8 pointer-events-none">{step.step}</span>
                  <div className="relative z-10 pt-12 md:pt-0">
                    <h3 className="text-3xl md:text-5xl font-bold mb-6 tracking-tight">{step.title}</h3>
                    <p className="text-gray-400 text-xl leading-relaxed">{step.desc}</p>
                  </div>
                </div>
                
                <div className="flex-1 w-full flex items-center justify-center relative z-10">
                  {step.visual}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* --- CTA Section --- */}
      <section className="py-40 relative overflow-hidden bg-black z-20">
        <div className="absolute inset-0 bg-grid-white opacity-10" />
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1 }}
          className="container mx-auto px-6 relative z-10 text-center"
        >
          <h2 className="text-6xl md:text-8xl font-bold tracking-tighter mb-8">Ready to build?</h2>
          <p className="text-xl text-gray-400 mb-12 max-w-2xl mx-auto">Join the next generation of founders building with absolute accountability and zero platform fees.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <MagneticButton className="px-10 py-5 bg-white text-black rounded-full font-bold text-lg hover:bg-gray-200 transition-colors">
              Launch Campaign
            </MagneticButton>
            <MagneticButton className="px-10 py-5 bg-transparent border border-white/20 text-white rounded-full font-bold text-lg hover:bg-white/5 transition-colors">
              Read Documentation
            </MagneticButton>
          </div>
        </motion.div>
      </section>

      {/* --- Footer --- */}
      <footer className="border-t border-white/10 py-12 bg-black relative z-20">
        <div className="container mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <EquifundLogo size={28} />
          <div className="flex gap-8 text-sm text-gray-500 font-mono">
            <a href="#" className="hover:text-white transition-colors">Twitter</a>
            <a href="#" className="hover:text-white transition-colors">GitHub</a>
            <a href="#" className="hover:text-white transition-colors">Discord</a>
            <a href="#" className="hover:text-white transition-colors">Docs</a>
          </div>
        </div>
      </footer>
    </motion.div>
  );
}

// --- Explore Projects Page ---
const ExplorePage = () => {
  const { token } = useAuth();
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignDetail | null>(null);
  const [fundingState, setFundingState] = useState<'idle' | 'input' | 'processing' | 'success'>('idle');
  const [fundAmount, setFundAmount] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loadingProject, setLoadingProject] = useState(false);
  const [detectedRegion, setDetectedRegion] = useState<'INDIA' | 'GLOBAL'>(() => detectRegion());
  const [fundingSuccessMessage, setFundingSuccessMessage] = useState('You have successfully backed this project.');

  useEffect(() => {
    setDetectedRegion(detectRegion());
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await api.listCampaigns();
        setCampaigns(response.campaigns.filter((campaign) => campaign.status === 'ACTIVE'));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Unable to load campaigns.');
      }
    };

    void load();
  }, []);

  const closeModal = () => {
    setSelectedId(null);
    setSelectedCampaign(null);
    setTimeout(() => {
      setFundingState('idle');
      setFundAmount('');
      setFundingSuccessMessage('You have successfully backed this project.');
    }, 300);
  };

  const openProject = async (campaignId: string) => {
    setSelectedId(campaignId);
    setLoadingProject(true);
    setError(null);
    setFundingState('idle');
    setFundAmount('');

    try {
      const response = await api.getCampaign(campaignId);
      setSelectedCampaign(response.campaign);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load campaign details.');
    } finally {
      setLoadingProject(false);
    }
  };

  const submitFunding = async () => {
    if (!selectedCampaign || !token || !fundAmount || Number(fundAmount) <= 0) {
      setError('Sign in with a backer or admin account and enter a valid amount.');
      return;
    }

    setFundingState('processing');
    setError(null);
    try {
      const amount = Number(fundAmount);
      const checkoutResponse = await api.createCheckoutSession(selectedCampaign.id, {
        amount,
        detectedRegion
      }, token);
      const checkout = checkoutResponse.checkout;

      if (checkout.provider === 'RAZORPAY') {
        if (!checkout.razorpay) {
          throw new Error('Razorpay checkout details are unavailable.');
        }

        // For judge demos, Razorpay stays in an in-app success flow rather than opening the real checkout.
        await new Promise((resolve) => window.setTimeout(resolve, 1200));

        const response = await api.contribute(selectedCampaign.id, {
          amount,
          assetType: 'FIAT',
          paymentSource: 'CARD'
        }, token);
        setSelectedCampaign(response.campaign);
        setCampaigns((current) => current.map((campaign) => campaign.id === response.campaign.id ? response.campaign : campaign));
        setFundingSuccessMessage(`Demo Razorpay payment successful. ${projectCurrencyLabel(selectedCampaign.currency)} ${amount.toLocaleString('en-IN')} has been recorded for ${selectedCampaign.title}.`);
        setFundingState('success');
        return;
      }

      const response = await api.contribute(selectedCampaign.id, {
        amount,
        assetType: 'USDC',
        paymentSource: 'WALLET'
      }, token);
      setSelectedCampaign(response.campaign);
      setCampaigns((current) => current.map((campaign) => campaign.id === response.campaign.id ? response.campaign : campaign));
      setFundingSuccessMessage(`Wallet funding successful. You have backed ${selectedCampaign.title}.`);
      setFundingState('success');
    } catch (err) {
      setFundingState('input');
      setError(err instanceof ApiError ? err.message : 'Funding failed.');
    }
  };

  const projectCurrencyLabel = (currency: string) => currency === 'INR' ? 'INR' : currency;

  const projects = useMemo(() => campaigns
    .filter((campaign) => [campaign.title, campaign.summary, campaign.category].join(' ').toLowerCase().includes(search.toLowerCase()))
    .map((campaign) => ({
      id: campaign.id,
      title: campaign.title,
      desc: campaign.summary,
      longDesc: campaign.summary,
      raised: campaign.totalRaised,
      goal: campaign.goalAmount,
      days: daysLeft(campaign.fundingDeadline),
      category: campaign.category,
      backers: campaign.backerCount,
      equity: `${Math.round(campaign.progressPercentage)}% funded`,
      valuation: money(campaign.goalAmount, campaign.currency),
      team: niceStatus(campaign.status),
      currency: campaign.currency,
      progress: campaign.progressPercentage,
      highlights: ['Open campaign to view backend milestone details.']
    })), [campaigns, search]);
  const fundingRail = selectedCampaign?.financeProfile?.fundingRail ?? (selectedCampaign?.currency === 'INR' ? 'INDIA_FIAT' : 'GLOBAL_CRYPTO');
  const paymentRailLabel = fundingRail === 'INDIA_FIAT' ? 'Razorpay / India Escrow' : 'Wallet / USDC';
  const paymentActionLabel = fundingRail === 'INDIA_FIAT' ? 'Pay with Razorpay' : 'Fund with Wallet';
  const regionLabel = detectedRegion === 'INDIA' ? 'India' : 'Global';
  const canFundSelectedCampaign = selectedCampaign?.status === 'ACTIVE';

  return (
    <motion.div 
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -40 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="min-h-screen pt-32 pb-24 px-6 md:px-12 container mx-auto"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16">
        <div>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="text-5xl md:text-7xl font-bold tracking-tighter mb-4"
          >
            Active Campaigns
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.8 }}
            className="text-gray-400 text-lg max-w-xl"
          >
            Discover and fund the next generation of decentralized protocols. Your funds are secured by trustless escrow.
          </motion.p>
        </div>
        
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="flex items-center gap-4"
        >
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-white transition-colors" />
            <input 
              type="text" 
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search projects..." 
              className="bg-white/5 border border-white/10 rounded-full py-3 pl-11 pr-6 text-sm focus:outline-none focus:border-white/30 focus:bg-white/10 transition-all w-full md:w-64"
            />
          </div>
          <button className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 hover:border-white/30 transition-all">
            <Filter className="w-4 h-4 text-gray-400" />
          </button>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((project, i) => (
          <motion.div
            layoutId={`project-${project.id}`}
            key={project.id}
            onClick={() => void openProject(project.id)}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 * i, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="group relative bg-white/[0.02] border border-white/5 rounded-3xl p-8 hover:bg-white/[0.04] transition-colors duration-500 overflow-hidden cursor-pointer"
          >
            {/* Hover Glow Effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-6">
                <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center border border-white/10 group-hover:scale-110 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]">
                  <Layers className="w-5 h-5 text-white" />
                </div>
                <span className="text-xs font-medium px-3 py-1 rounded-full bg-white/5 border border-white/10 text-gray-400">
                  {project.category}
                </span>
              </div>
              
              <h3 className="text-2xl font-bold tracking-tight mb-2 group-hover:text-white transition-colors">{project.title}</h3>
              <p className="text-sm text-gray-400 mb-8 line-clamp-2">{project.desc}</p>
              
              <div className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-white font-medium">{compactMoney(project.raised, project.currency)} <span className="text-gray-500 font-normal">raised</span></span>
                  <span className="text-gray-500">{compactMoney(project.goal, project.currency)} goal</span>
                </div>
                
                <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(0, Math.min(100, project.progress))}%` }}
                    transition={{ delay: 0.5 + (0.1 * i), duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
                    className="h-full bg-white rounded-full relative"
                  >
                    <div className="absolute inset-0 bg-white blur-[4px] opacity-50" />
                  </motion.div>
                </div>
                
                <div className="flex justify-between text-xs text-gray-500 font-mono pt-2">
                  <span>{Math.round(project.progress)}% FUNDED</span>
                  <span>{project.days} DAYS LEFT</span>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Expanded Project Modal */}
      <AnimatePresence>
        {selectedId && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeModal}
              className="fixed inset-0 bg-black/60 backdrop-blur-xl z-[100]"
            />
            <div className="fixed inset-0 flex items-center justify-center z-[101] pointer-events-none px-4 md:px-6">
              {(() => {
                const summaryProject = projects.find(p => p.id === selectedId);
                const project = selectedCampaign && selectedCampaign.id === selectedId
                  ? {
                    id: selectedCampaign.id,
                    title: selectedCampaign.title,
                    desc: selectedCampaign.summary,
                    longDesc: selectedCampaign.description,
                    raised: selectedCampaign.totalRaised,
                    goal: selectedCampaign.goalAmount,
                    days: daysLeft(selectedCampaign.fundingDeadline),
                    category: selectedCampaign.category,
                    backers: selectedCampaign.backerCount,
                    equity: niceStatus(selectedCampaign.status),
                    valuation: money(selectedCampaign.goalAmount, selectedCampaign.currency),
                    team: selectedCampaign.founderVerification?.kycStatus ?? 'Pending',
                    currency: selectedCampaign.currency,
                    progress: selectedCampaign.progressPercentage,
                    highlights: selectedCampaign.milestones.map((milestone) => `${milestone.position}. ${milestone.title} • ${niceStatus(milestone.status)}`)
                  }
                  : summaryProject;
                if (!project) return null;
                return (
                  <motion.div
                    layoutId={`project-${selectedId}`}
                    className="w-full max-w-5xl max-h-[90vh] overflow-y-auto bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] p-8 md:p-12 pointer-events-auto relative shadow-[0_0_100px_rgba(255,255,255,0.05)] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        closeModal();
                      }}
                      className="absolute top-6 right-6 md:top-8 md:right-8 w-12 h-12 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full flex items-center justify-center transition-colors z-50 cursor-pointer"
                    >
                      <X className="w-5 h-5 text-gray-400 hover:text-white transition-colors" />
                    </button>

                    <div className="relative z-10 flex flex-col lg:flex-row gap-12 mt-4 md:mt-0">
                      <div className="flex-1 space-y-12">
                        <div>
                          <motion.div 
                            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                            className="flex items-center gap-4 mb-6"
                          >
                            <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center border border-white/10">
                              <Layers className="w-8 h-8 text-white" />
                            </div>
                            <span className="text-sm font-medium px-4 py-2 rounded-full bg-white/5 border border-white/10 text-gray-300">
                              {project.category}
                            </span>
                          </motion.div>
                          
                          <motion.h2 
                            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                            className="text-4xl md:text-6xl font-bold tracking-tighter mb-6"
                          >
                            {project.title}
                          </motion.h2>
                          
                          <motion.p 
                            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                            className="text-lg text-gray-400 leading-relaxed"
                          >
                            {project.longDesc}
                          </motion.p>
                        </div>

                        <motion.div 
                          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
                          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                        >
                          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6">
                            <div className="text-gray-500 text-sm mb-2">Founder Verification</div>
                            <div className="text-white font-medium">{project.team}</div>
                          </div>
                          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6">
                            <div className="text-gray-500 text-sm mb-2">Funding Goal</div>
                            <div className="text-white font-medium">{project.valuation}</div>
                          </div>
                        </motion.div>

                        <motion.div
                          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
                        >
                          <h3 className="text-xl font-bold mb-6">Milestone Snapshot</h3>
                          <ul className="space-y-4">
                            {project.highlights.map((h, i) => (
                              <li key={i} className="flex items-start gap-4 text-gray-400">
                                <CheckCircle2 className="w-6 h-6 text-white/30 shrink-0" />
                                <span className="pt-0.5">{h}</span>
                              </li>
                            ))}
                          </ul>
                        </motion.div>
                      </div>

                      <motion.div 
                        initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}
                        className="w-full lg:w-96 shrink-0"
                      >
                        <div className="sticky top-0 bg-white/[0.02] border border-white/5 rounded-3xl p-8 flex flex-col justify-between min-h-[450px]">
                          <AnimatePresence mode="wait">
                            {fundingState === 'idle' && (
                              <motion.div key="idle" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col h-full justify-between">
                                <div>
                                  <div className="mb-8">
                                    <div className="text-5xl font-light tracking-tighter text-white mb-2">{compactMoney(project.raised, project.currency)}</div>
                                    <div className="text-gray-500">raised of {compactMoney(project.goal, project.currency)} goal</div>
                                  </div>
                                  
                                  <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden mb-8">
                                    <motion.div 
                                      initial={{ width: 0 }}
                                      animate={{ width: `${Math.max(0, Math.min(100, project.progress))}%` }}
                                      transition={{ delay: 0.6, duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
                                      className="h-full bg-white rounded-full relative"
                                    >
                                      <div className="absolute inset-0 bg-white blur-[4px] opacity-50" />
                                    </motion.div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-6 mb-8">
                                <div>
                                  <div className="text-2xl font-light text-white mb-1">{project.backers}</div>
                                  <div className="text-xs text-gray-500 uppercase tracking-wider">Backers</div>
                                </div>
                                <div>
                                  <div className="text-2xl font-light text-white mb-1">{project.equity}</div>
                                      <div className="text-xs text-gray-500 uppercase tracking-wider">Campaign Status</div>
                                </div>
                              </div>
                                </div>

                                <div>
                                  <MagneticButton
                                    onClick={() => setFundingState('input')} 
                                    className="w-full bg-white text-black py-4 rounded-full font-medium hover:scale-105 transition-transform flex items-center justify-center gap-2 cursor-pointer"
                                  >
                                      Fund Project <ArrowRight className="w-4 h-4" />
                                  </MagneticButton>
                                  <p className="text-center text-xs text-gray-500 mt-6">Funding actions post directly to the backend contribution flow.</p>
                                </div>
                              </motion.div>
                            )}

                            {fundingState === 'input' && (
                              <motion.div key="input" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col h-full justify-between">
                                <div>
                                  <button onClick={() => setFundingState('idle')} className="text-gray-400 hover:text-white mb-6 flex items-center gap-2 text-sm transition-colors cursor-pointer w-fit">
                                    <ArrowRight className="w-4 h-4 rotate-180" /> Back
                                  </button>
                                  <h3 className="text-2xl font-bold mb-6">Fund {project.title}</h3>
                                  
                                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-6 focus-within:border-white/30 transition-colors">
                                    <div className="text-xs text-gray-500 mb-2">Amount ({project.currency})</div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-2xl text-gray-400">{project.currency === 'INR' ? 'Rs' : '$'}</span>
                                      <input 
                                        type="number" 
                                        value={fundAmount} 
                                        onChange={e => setFundAmount(e.target.value)} 
                                        placeholder="10,000" 
                                        className="w-full bg-transparent text-4xl text-white outline-none font-light" 
                                        autoFocus 
                                      />
                                    </div>
                                  </div>

                                  <div className="space-y-3 mb-8">
                                    <div className="flex justify-between text-sm">
                                      <span className="text-gray-500">Detected Region</span>
                                      <span className="text-white">{regionLabel}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                      <span className="text-gray-500">Payment Rail</span>
                                      <span className="text-white">{paymentRailLabel}</span>
                                    </div>
                                    {fundingRail === 'INDIA_FIAT' && detectedRegion !== 'INDIA' && (
                                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-300">
                                        This campaign uses the India-compliant escrow rail, so checkout will still route through Razorpay.
                                      </div>
                                    )}
                                    {fundingRail === 'GLOBAL_CRYPTO' && detectedRegion === 'INDIA' && (
                                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-300">
                                        You are in India, but this campaign is configured for the global crypto rail and will use a wallet-based USDC flow.
                                      </div>
                                    )}
                                    <div className="flex justify-between text-sm">
                                      <span className="text-gray-500">Projected Share Of Goal</span>
                                      <span className="text-green-400 font-medium">
                                        {fundAmount ? `${((Number(fundAmount) / project.goal) * 100).toFixed(2)}%` : "0.00%"}
                                      </span>
                                    </div>
                                  </div>

                                  {error && (
                                    <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                                      {error}
                                    </div>
                                  )}
                                  {!canFundSelectedCampaign && (
                                    <div className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                                      This campaign is not live for funding yet. Open an active campaign to use the demo payment flow.
                                    </div>
                                  )}
                                </div>

                                <MagneticButton
                                    onClick={() => void submitFunding()} 
                                    disabled={!fundAmount || Number(fundAmount) <= 0 || !canFundSelectedCampaign}
                                    className="w-full bg-white text-black py-4 rounded-full font-medium hover:scale-105 transition-transform flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:hover:scale-100"
                                  >
                                    {paymentActionLabel} <ArrowRight className="w-4 h-4" />
                                </MagneticButton>
                              </motion.div>
                            )}

                            {fundingState === 'processing' && (
                              <motion.div key="processing" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="flex flex-col h-full items-center justify-center text-center py-12">
                                <div className="w-16 h-16 border-4 border-white/10 border-t-white rounded-full animate-spin mb-8" />
                                <h3 className="text-xl font-bold mb-2">{fundingRail === 'INDIA_FIAT' ? 'Running Razorpay Demo Checkout' : 'Recording Contribution'}</h3>
                                <p className="text-gray-400 text-sm">
                                  {fundingRail === 'INDIA_FIAT'
                                    ? 'Showing a judge-friendly Razorpay demo flow, then saving the contribution through the backend.'
                                    : 'Saving your contribution through the Fastify backend.'}
                                </p>
                              </motion.div>
                            )}

                            {fundingState === 'success' && (
                              <motion.div key="success" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="flex flex-col h-full items-center justify-center text-center py-8">
                                <motion.div
                                  initial={{ scale: 0.7, rotate: -8, opacity: 0 }}
                                  animate={{ scale: 1, rotate: 0, opacity: 1 }}
                                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                                  className="relative mb-6"
                                >
                                  <div className="absolute inset-0 rounded-full bg-green-400/20 blur-2xl" />
                                  <div className="relative w-20 h-20 bg-green-500/10 text-green-400 rounded-full flex items-center justify-center border border-green-500/20">
                                    <CheckCircle2 className="w-10 h-10" />
                                  </div>
                                </motion.div>
                                <motion.h3
                                  initial={{ opacity: 0, y: 12 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: 0.1, duration: 0.35 }}
                                  className="text-2xl font-bold mb-2"
                                >
                                  Success
                                </motion.h3>
                                <motion.p
                                  initial={{ opacity: 0, y: 12 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: 0.18, duration: 0.35 }}
                                  className="text-gray-400 text-sm mb-8"
                                >
                                  {fundingSuccessMessage}
                                </motion.p>
                                {fundingRail === 'INDIA_FIAT' && (
                                  <motion.div
                                    initial={{ opacity: 0, y: 12 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.24, duration: 0.35 }}
                                    className="mb-8 rounded-full border border-green-500/20 bg-green-500/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-green-300"
                                  >
                                    Razorpay Demo Complete
                                  </motion.div>
                                )}
                                <MagneticButton
                                  onClick={closeModal} 
                                  className="w-full bg-white/10 text-white py-4 px-8 rounded-full font-medium hover:bg-white/20 transition-colors cursor-pointer"
                                >
                                    Done
                                </MagneticButton>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </motion.div>
                    </div>
                  </motion.div>
                );
              })()}
            </div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// --- Start Campaign Page (Wizard) ---
const CreatePage = () => {
  const { token, user } = useAuth();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({ 
    name: '', 
    tagline: '',
    category: '',
    goal: '',
    equity: '',
    team: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const navigate = useNavigate();

  const totalSteps = 6;
  const normalizedName = formData.name.trim();
  const normalizedTagline = formData.tagline.trim();
  const normalizedCategory = formData.category.trim();
  const normalizedTeam = formData.team.trim();
  const goalAmount = Number(formData.goal);

  const campaignSummary = normalizedTagline.length >= 10
    ? normalizedTagline
    : `${normalizedName || 'Project'} is building ${normalizedTagline || 'a production-ready product'} for milestone-based crowdfunding.`;
  const campaignDescription = [
    `${normalizedName || 'This project'} is building ${normalizedTagline || 'a platform for accountable product launches'} with milestone-based execution and escrow-backed delivery.`,
    `Category: ${normalizedCategory || 'General technology'}.`,
    `Team profile: ${normalizedTeam || 'Founding team details will be shared during campaign review'}.`,
    `Planned raise: ${Number.isFinite(goalAmount) && goalAmount > 0 ? goalAmount.toLocaleString('en-IN') : 'TBD'} INR with ${formData.equity || 'founder-defined'} allocation guidance for investors.`,
    'This campaign was launched from the original Gemini frontend and connected to the live backend workflow.'
  ].join(' ');

  const handleNext = async (e?: ReactKeyboardEvent | ReactMouseEvent) => {
    if (e && 'key' in e && (e as ReactKeyboardEvent).key !== 'Enter') return;
    if (step < totalSteps) {
      setStep(step + 1);
      return;
    }

    if (!token) {
      setSubmitError('Sign in as a founder or admin before deploying a campaign.');
      return;
    }

    if (!normalizedName || !normalizedTagline || !normalizedCategory || !normalizedTeam || !Number.isFinite(goalAmount) || goalAmount <= 0) {
      setSubmitError('Complete every step with valid campaign details before deploying.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const created = await api.createCampaign({
        title: normalizedName.length >= 5 ? normalizedName : `${normalizedName} Launch`,
        summary: campaignSummary,
        description: campaignDescription,
        category: normalizedCategory || 'Technology',
        goalAmount,
        currency: 'INR',
        fundingDeadline: new Date(Date.now() + 30 * 86400000).toISOString(),
        milestones: [
          {
            title: 'Prototype Release',
            description: `Deliver the first usable build for ${normalizedName || 'the project'} with demo material, documentation, and validation updates.`,
            percentage: 40
          },
          {
            title: 'Launch Expansion',
            description: `Scale ${normalizedName || 'the project'} with rollout, investor reporting, onboarding, and milestone verification.`,
            percentage: 60
          }
        ]
      }, token);
      await api.publishCampaign(created.campaign.id, token);
      navigate('/founder');
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Unable to deploy campaign.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const categories = ["DeFi", "Infrastructure", "Gaming", "Social", "AI", "Consumer"];

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
      className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden"
    >
      {/* Progress Bar */}
      <div className="absolute top-0 left-0 w-full h-1 bg-white/10">
        <motion.div 
          className="h-full bg-white"
          animate={{ width: `${(step / totalSteps) * 100}%` }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>

      <div className="w-full max-w-3xl relative h-[400px]">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div 
              key="step1"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -40 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0 flex flex-col justify-center"
            >
              <span className="text-gray-500 font-mono text-sm mb-6">01 / 0{totalSteps}</span>
              <h2 className="text-4xl md:text-6xl font-bold tracking-tighter mb-8">What are you building?</h2>
              <input 
                autoFocus
                type="text" 
                placeholder="Project Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                onKeyDown={handleNext}
                className="w-full bg-transparent border-b-2 border-white/20 pb-4 text-3xl md:text-5xl font-light focus:outline-none focus:border-white transition-colors placeholder:text-white/20"
              />
              <div className="mt-8 flex items-center gap-4 text-gray-500">
                <button onClick={() => handleNext()} disabled={!formData.name} className="flex items-center gap-2 text-white hover:text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  Press Enter <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div 
              key="step2"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -40 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0 flex flex-col justify-center"
            >
              <span className="text-gray-500 font-mono text-sm mb-6">02 / 0{totalSteps}</span>
              <h2 className="text-4xl md:text-6xl font-bold tracking-tighter mb-8">Give it a tagline.</h2>
              <input 
                autoFocus
                type="text" 
                placeholder="e.g. Decentralized AI inference network"
                value={formData.tagline}
                onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
                onKeyDown={handleNext}
                className="w-full bg-transparent border-b-2 border-white/20 pb-4 text-2xl md:text-4xl font-light focus:outline-none focus:border-white transition-colors placeholder:text-white/20"
              />
              <div className="mt-8 flex items-center gap-4 text-gray-500">
                <button onClick={() => handleNext()} disabled={!formData.tagline} className="flex items-center gap-2 text-white hover:text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  Press Enter <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div 
              key="step3"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -40 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0 flex flex-col justify-center"
            >
              <span className="text-gray-500 font-mono text-sm mb-6">03 / 0{totalSteps}</span>
              <h2 className="text-4xl md:text-6xl font-bold tracking-tighter mb-8">Select a category.</h2>
              <div className="flex flex-wrap gap-4">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => {
                      setFormData({ ...formData, category: cat });
                      setTimeout(() => handleNext(), 300);
                    }}
                    className={`px-6 py-3 rounded-full border transition-all duration-300 text-lg ${
                      formData.category === cat 
                        ? 'bg-white text-black border-white' 
                        : 'bg-transparent border-white/20 text-white hover:border-white/60'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div 
              key="step4"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -40 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0 flex flex-col justify-center"
            >
              <span className="text-gray-500 font-mono text-sm mb-6">04 / 0{totalSteps}</span>
              <h2 className="text-4xl md:text-6xl font-bold tracking-tighter mb-8">Funding & Equity.</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="relative">
                  <div className="text-sm text-gray-500 mb-2">Funding Goal (USDC)</div>
                  <span className="absolute left-0 bottom-4 text-3xl md:text-5xl font-light text-white/50">$</span>
                  <input 
                    autoFocus
                    type="number" 
                    placeholder="2,000,000"
                    value={formData.goal}
                    onChange={(e) => setFormData({ ...formData, goal: e.target.value })}
                    className="w-full bg-transparent border-b-2 border-white/20 pb-4 pl-12 text-3xl md:text-5xl font-light focus:outline-none focus:border-white transition-colors placeholder:text-white/20"
                  />
                </div>
                <div className="relative">
                  <div className="text-sm text-gray-500 mb-2">Equity/Token Allocation (%)</div>
                  <input 
                    type="number" 
                    placeholder="10.5"
                    value={formData.equity}
                    onChange={(e) => setFormData({ ...formData, equity: e.target.value })}
                    onKeyDown={handleNext}
                    className="w-full bg-transparent border-b-2 border-white/20 pb-4 text-3xl md:text-5xl font-light focus:outline-none focus:border-white transition-colors placeholder:text-white/20"
                  />
                  <span className="absolute right-0 bottom-4 text-3xl md:text-5xl font-light text-white/50">%</span>
                </div>
              </div>
              <div className="mt-8 flex items-center gap-4 text-gray-500">
                <button onClick={() => handleNext()} disabled={!formData.goal || !formData.equity} className="flex items-center gap-2 text-white hover:text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  Press Enter <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {step === 5 && (
            <motion.div 
              key="step5"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -40 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0 flex flex-col justify-center"
            >
              <span className="text-gray-500 font-mono text-sm mb-6">05 / 0{totalSteps}</span>
              <h2 className="text-4xl md:text-6xl font-bold tracking-tighter mb-8">Who is the team?</h2>
              <input 
                autoFocus
                type="text" 
                placeholder="e.g. Ex-Google, DeepMind, Stanford CS"
                value={formData.team}
                onChange={(e) => setFormData({ ...formData, team: e.target.value })}
                onKeyDown={handleNext}
                className="w-full bg-transparent border-b-2 border-white/20 pb-4 text-2xl md:text-4xl font-light focus:outline-none focus:border-white transition-colors placeholder:text-white/20"
              />
              <div className="mt-8 flex items-center gap-4 text-gray-500">
                <button onClick={() => handleNext()} disabled={!formData.team} className="flex items-center gap-2 text-white hover:text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  Press Enter <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {step === 6 && (
            <motion.div 
              key="step3"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -40 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0 flex flex-col justify-center items-center text-center"
            >
              <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mb-8">
                <CheckCircle2 className="w-10 h-10 text-black" />
              </div>
              <h2 className="text-4xl md:text-6xl font-bold tracking-tighter mb-4">Ready to deploy.</h2>
              <p className="text-gray-400 text-lg max-w-md mb-12">
                Your campaign will be created and published through the backend using the signed-in founder account.
              </p>
              <div className="mb-8 text-sm text-gray-500">
                Launching as: {user ? `${user.fullName} (${user.role})` : 'Not signed in'}
              </div>
              {submitError && (
                <div className="mb-8 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {submitError}
                </div>
              )}
              <MagneticButton
                onClick={() => void handleNext()}
                className="bg-white text-black px-10 py-5 rounded-full text-lg font-medium hover:scale-105 hover:shadow-[0_0_30px_rgba(255,255,255,0.4)] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] flex items-center gap-3 disabled:opacity-60"
                disabled={isSubmitting}
              >
                  {isSubmitting ? 'Deploying...' : 'Deploy Contract'} <Zap className="w-5 h-5" />
              </MagneticButton>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

// --- Founder Dashboard ---
const FounderDashboard = () => {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [details, setDetails] = useState<CampaignDetail[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const list = await api.listCampaigns();
        const mine = list.campaigns.filter((campaign) => user?.role === 'ADMIN' || campaign.founderId === user?.id);
        setCampaigns(mine);
        setDetails(await Promise.all(mine.map((campaign) => api.getCampaign(campaign.id).then((response) => response.campaign))));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Unable to load founder dashboard.');
      }
    };

    void load();
  }, [user?.id, user?.role]);

  const totalRaised = campaigns.reduce((sum, campaign) => sum + campaign.totalRaised, 0);
  const totalBackers = campaigns.reduce((sum, campaign) => sum + campaign.backerCount, 0);
  const nearestDeadline = campaigns.length > 0 ? campaigns.reduce((soonest, campaign) =>
    new Date(campaign.fundingDeadline).getTime() < new Date(soonest.fundingDeadline).getTime() ? campaign : soonest
  ) : null;
  const milestones = details.flatMap((campaign) => campaign.milestones);
  const contributions = details
    .flatMap((campaign) => campaign.contributions.map((contribution) => ({ campaign, contribution })))
    .sort((left, right) => new Date(right.contribution.createdAt).getTime() - new Date(left.contribution.createdAt).getTime())
    .slice(0, 6);

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -40 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="min-h-screen pt-32 pb-24 px-6 md:px-12 container mx-auto"
    >
      <div className="mb-12">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tighter mb-4">Founder Hub</h1>
        <p className="text-gray-400 text-lg">Manage your campaign, track escrow unlocks, and view backer analytics.</p>
      </div>

      {error && <div className="mb-8 rounded-3xl border border-red-500/20 bg-red-500/10 px-6 py-4 text-red-200">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {[
          { label: "Total Raised", value: money(totalRaised, campaigns[0]?.currency ?? 'INR'), icon: <Wallet className="w-5 h-5 text-gray-400" />, trend: `${campaigns.length} campaigns` },
          { label: "Backers", value: `${totalBackers}`, icon: <Users className="w-5 h-5 text-gray-400" />, trend: "Across active launches" },
          { label: "Milestones", value: `${milestones.length}`, icon: <Activity className="w-5 h-5 text-gray-400" />, trend: "Tracked unlock checkpoints" },
          { label: "Time Remaining", value: nearestDeadline ? `${daysLeft(nearestDeadline.fundingDeadline)} Days` : "--", icon: <Clock className="w-5 h-5 text-gray-400" />, trend: nearestDeadline ? `Ends ${new Date(nearestDeadline.fundingDeadline).toLocaleDateString()}` : 'No active deadline' }
        ].map((stat, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 * i }} className="bg-white/[0.02] border border-white/5 rounded-3xl p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">{stat.icon}</div>
            </div>
            <div className="text-3xl font-light text-white mb-1">{stat.value}</div>
            <div className="text-sm text-gray-500 flex justify-between"><span>{stat.label}</span> <span className="text-green-400/80">{stat.trend}</span></div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="lg:col-span-2 bg-white/[0.02] border border-white/5 rounded-3xl p-8">
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2"><ArrowDownRight className="w-5 h-5 text-green-400" /> Recent Deposits</h3>
          <div className="space-y-4">
            {contributions.map(({ campaign, contribution }) => (
              <div key={contribution.id} className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.01] border border-white/5 hover:bg-white/[0.03] transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center border border-white/10">
                    <Wallet className="w-4 h-4 text-gray-400" />
                  </div>
                  <div>
                    <div className="font-mono text-sm text-white">{campaign.title}</div>
                    <div className="text-xs text-gray-500">{relativeDays(contribution.createdAt)}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-green-400 font-medium">+{money(contribution.amount, campaign.currency)}</div>
                  <div className="text-xs text-gray-500 font-mono">Source: {contribution.paymentSource}</div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="bg-white/[0.02] border border-white/5 rounded-3xl p-8">
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2"><Lock className="w-5 h-5 text-gray-400" /> Escrow Unlocks</h3>
          <div className="relative border-l border-white/10 ml-4 space-y-8 pb-4">
            {milestones.map((milestone) => {
              const unlocked = milestone.status === 'APPROVED' || milestone.status === 'PAID';
              return (
                <div key={milestone.id} className="relative pl-8">
                  <div className={`absolute -left-4 top-0 w-8 h-8 rounded-full ${unlocked ? 'bg-white' : 'bg-gray-800'} flex items-center justify-center border-4 border-[#0a0a0a]`}>
                    {unlocked ? <Unlock className="w-4 h-4 text-black" /> : <Lock className="w-4 h-4 text-gray-400" />}
                  </div>
                  <div className="mb-1 text-sm text-gray-500">{milestone.voteClosesAt ? new Date(milestone.voteClosesAt).toLocaleDateString() : 'Pending vote window'}</div>
                  <div className="text-lg font-medium text-white mb-1">{milestone.title}</div>
                  <div className="text-xl font-light text-gray-300">{money(milestone.currentlyUnlockableAmount, campaigns[0]?.currency ?? 'INR')}</div>
                  <div className={`text-xs mt-2 inline-block px-2 py-1 rounded-md ${unlocked ? 'bg-green-500/10 text-green-400' : 'bg-white/5 text-gray-400'}`}>
                    {niceStatus(milestone.status)}
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

// --- Investor Dashboard ---
const InvestorDashboard = () => {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<CampaignDetail[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const list = await api.listCampaigns();
        const full = await Promise.all(list.campaigns.map((campaign) => api.getCampaign(campaign.id).then((response) => response.campaign)));
        setCampaigns(full.filter((campaign) => campaign.contributions.some((contribution) => contribution.backerId === user?.id) || user?.role === 'ADMIN'));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Unable to load investor dashboard.');
      }
    };

    void load();
  }, [user?.id, user?.role]);

  const activities = campaigns
    .flatMap((campaign) => campaign.contributions
      .filter((contribution) => contribution.backerId === user?.id || user?.role === 'ADMIN')
      .map((contribution) => ({ campaign, contribution })))
    .sort((left, right) => new Date(right.contribution.createdAt).getTime() - new Date(left.contribution.createdAt).getTime());
  const invested = activities.reduce((sum, item) => sum + item.contribution.amount, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -40 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="min-h-screen pt-32 pb-24 px-6 md:px-12 container mx-auto"
    >
      <div className="mb-12">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tighter mb-4">Investor Portfolio</h1>
        <p className="text-gray-400 text-lg">Track your backed projects, claim tokens, and monitor your unrealized equity.</p>
      </div>

      {error && <div className="mb-8 rounded-3xl border border-red-500/20 bg-red-500/10 px-6 py-4 text-red-200">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {[
          { label: "Total Invested", value: money(invested, campaigns[0]?.currency ?? 'INR'), icon: <Wallet className="w-5 h-5 text-gray-400" /> },
          { label: "Active Projects", value: `${campaigns.length}`, icon: <Layers className="w-5 h-5 text-gray-400" /> },
          { label: "Recent Activity", value: `${activities.length}`, icon: <TrendingUp className="w-5 h-5 text-gray-400" />, trend: "Backend-synced contributions" }
        ].map((stat, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 * i }} className="bg-white/[0.02] border border-white/5 rounded-3xl p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">{stat.icon}</div>
              {stat.trend && <span className="text-green-400/80 text-sm font-medium bg-green-400/10 px-2 py-1 rounded-full">{stat.trend}</span>}
            </div>
            <div className="text-4xl font-light text-white mb-1">{stat.value}</div>
            <div className="text-sm text-gray-500">{stat.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="lg:col-span-2 bg-white/[0.02] border border-white/5 rounded-3xl p-8">
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2"><PieChart className="w-5 h-5 text-gray-400" /> Your Projects</h3>
          <div className="space-y-4">
            {campaigns.map((campaign) => {
              const ownAmount = campaign.contributions
                .filter((contribution) => contribution.backerId === user?.id || user?.role === 'ADMIN')
                .reduce((sum, contribution) => sum + contribution.amount, 0);
              return (
                <div key={campaign.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-6 rounded-2xl bg-white/[0.01] border border-white/5 hover:bg-white/[0.03] transition-colors gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center border border-white/10">
                      <Layers className="w-5 h-5 text-gray-400" />
                    </div>
                    <div>
                      <div className="font-bold text-lg text-white">{campaign.title}</div>
                      <div className="text-xs text-gray-500">{campaign.category} • {niceStatus(campaign.status)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-8">
                    <div className="text-right">
                      <div className="text-gray-400 text-sm">Invested</div>
                      <div className="text-white font-medium">{money(ownAmount, campaign.currency)}</div>
                    </div>
                    <div className="text-right hidden sm:block">
                      <div className="text-gray-400 text-sm">Campaign Progress</div>
                      <div className="text-white font-medium">{Math.round(campaign.progressPercentage)}%</div>
                    </div>
                    <button className="px-4 py-2 rounded-full text-sm font-medium transition-colors bg-white/5 text-gray-400 cursor-default">
                      {campaign.contributions.length} entries
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="bg-white/[0.02] border border-white/5 rounded-3xl p-8">
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2"><Activity className="w-5 h-5 text-gray-400" /> Activity</h3>
          <div className="space-y-6">
            {activities.map(({ campaign, contribution }) => (
              <div key={contribution.id} className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10 shrink-0">
                  <ArrowUpRight className="w-4 h-4 text-red-400" />
                </div>
                <div className="flex-1">
                  <div className="text-sm text-white font-medium">Funded {campaign.title}</div>
                  <div className="text-xs text-gray-500">{relativeDays(contribution.createdAt)}</div>
                </div>
                <div className="text-sm font-medium text-white">
                  -{money(contribution.amount, campaign.currency)}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

// --- Scroll Provider for Routing ---
const ScrollProvider = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 2,
    });

    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }

    requestAnimationFrame(raf);

    return () => {
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
};

// --- Root App with Router ---
export default function App() {
  return (
    <AuthProvider>
      <Router>
        <ScrollProvider>
          <div className="bg-black text-white min-h-screen font-sans selection:bg-white/30 relative cursor-none md:cursor-auto">
            {/* Cinematic Noise Overlay */}
            <div className="fixed inset-0 z-50 pointer-events-none opacity-[0.03] mix-blend-overlay" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}></div>
            
            <CustomCursor />
            <Navbar />
            
            <AnimatePresence mode="wait">
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/pricing" element={<PricingPage />} />
                <Route path="/explore" element={<ProtectedRoute><ExplorePage /></ProtectedRoute>} />
                <Route path="/create" element={<ProtectedRoute><CreatePage /></ProtectedRoute>} />
                <Route path="/founder" element={<ProtectedRoute><FounderDashboard /></ProtectedRoute>} />
                <Route path="/investor" element={<ProtectedRoute><InvestorDashboard /></ProtectedRoute>} />
              </Routes>
            </AnimatePresence>
          </div>
        </ScrollProvider>
      </Router>
    </AuthProvider>
  );
}

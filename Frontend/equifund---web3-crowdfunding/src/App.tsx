import { motion } from 'motion/react';
import { ArrowRight, CheckCircle2, Layers, Lock, Search, Shield, Users, Wallet, X, Zap } from 'lucide-react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { BrowserRouter as Router, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError, type AuthUser, type CampaignDetail, type CampaignSummary, type UserVerification } from './api';

const KEY = 'stellaris.frontend.token';
const money = (n: number, c = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: n >= 100 ? 0 : 2 }).format(n);
const compact = (n: number, c = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency: c, notation: 'compact', maximumFractionDigits: 1 }).format(n);
const daysLeft = (s: string) => Math.max(0, Math.ceil((new Date(s).getTime() - Date.now()) / 86400000));
const nice = (s: string) => s.toLowerCase().split('_').map((p) => p[0].toUpperCase() + p.slice(1)).join(' ');

type AuthCtx = {
  ready: boolean;
  token: string | null;
  user: AuthUser | null;
  verification: UserVerification | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};
const Auth = createContext<AuthCtx | null>(null);
const useAuth = () => {
  const ctx = useContext(Auth);
  if (!ctx) throw new Error('Missing auth context');
  return ctx;
};

function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(KEY));
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
        localStorage.removeItem(KEY);
        setToken(null);
      } finally {
        setReady(true);
      }
    };
    void boot();
  }, [token]);

  const login = async (email: string, password: string) => {
    const auth = await api.login(email, password);
    localStorage.setItem(KEY, auth.token);
    setToken(auth.token);
    setUser(auth.user);
    const me = await api.me(auth.token);
    setVerification(me.verification);
  };

  const logout = () => {
    localStorage.removeItem(KEY);
    setToken(null);
    setUser(null);
    setVerification(null);
  };

  return <Auth.Provider value={{ ready, token, user, verification, login, logout }}>{children}</Auth.Provider>;
}

function Frame({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-black text-white selection:bg-white/20">{children}</div>;
}

function Nav() {
  const { user, logout } = useAuth();
  return (
    <div className="sticky top-0 z-20 border-b border-white/10 bg-black/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-3"><div className="h-8 w-8 rounded-md bg-white" /><span className="font-semibold">Equifund</span></Link>
        <div className="hidden md:flex gap-6 text-sm text-gray-400"><Link to="/explore">Explore</Link><Link to="/create">Launch</Link><Link to="/founder">Founder</Link><Link to="/investor">Investor</Link></div>
        <div className="flex items-center gap-3 text-sm">{user ? <><span className="hidden md:inline rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs">{user.role}</span><button onClick={logout} className="text-gray-400">Sign Out</button></> : <Link to="/login" className="text-gray-400">Sign In</Link>}<Link to={user ? '/explore' : '/login'} className="rounded-full bg-white px-4 py-2 font-medium text-black">{user ? 'Open App' : 'Launch'}</Link></div>
      </div>
    </div>
  );
}

function Gate({ children }: { children: ReactNode }) {
  const { ready, user } = useAuth();
  const location = useLocation();
  if (!ready) return <div className="flex min-h-[60vh] items-center justify-center"><div className="h-12 w-12 rounded-full border-4 border-white/10 border-t-white animate-spin" /></div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}

function Home() {
  const { user } = useAuth();
  return <main className="mx-auto max-w-7xl px-6 py-16"><div className="grid gap-8 lg:grid-cols-[1.3fr_0.9fr]"><div><div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.25em] text-gray-400"><Shield className="h-4 w-4" /> Backend Connected</div><h1 className="text-5xl font-semibold tracking-tight md:text-7xl">Frontend imported. Real backend wired in.</h1><p className="mt-6 max-w-2xl text-lg text-gray-400">This app now authenticates against Fastify, loads campaigns from the API, creates founder launches, and records contributions through the backend flow.</p><div className="mt-8 flex gap-3"><Link to={user ? '/explore' : '/login'} className="rounded-full bg-white px-6 py-3 font-medium text-black">{user ? 'Go To Campaigns' : 'Sign In'}</Link><Link to="/create" className="rounded-full border border-white/15 px-6 py-3 font-medium">Launch Campaign</Link></div></div><div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-8"><div className="space-y-4 text-sm text-gray-300"><div className="rounded-2xl border border-white/8 bg-black/30 p-4">JWT auth via `/api/auth/login` and `/api/auth/me`</div><div className="rounded-2xl border border-white/8 bg-black/30 p-4">Explore uses `/api/campaigns` and campaign detail fetches</div><div className="rounded-2xl border border-white/8 bg-black/30 p-4">Funding posts to `/api/campaigns/:id/contributions`</div><div className="rounded-2xl border border-white/8 bg-black/30 p-4">Founder launch creates and publishes campaigns</div></div></div></div></main>;
}

function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('founder@stellaris.dev');
  const [password, setPassword] = useState('secret-pass-founder');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const from = location.state?.from?.pathname || '/explore';
  useEffect(() => { if (user) navigate(from, { replace: true }); }, [user, from, navigate]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try { await login(email, password); navigate(from, { replace: true }); } catch (err) { setError(err instanceof ApiError ? err.message : 'Unable to sign in.'); } finally { setBusy(false); }
  };
  return <main className="mx-auto flex min-h-[calc(100vh-84px)] max-w-5xl items-center justify-center px-6 py-16"><div className="grid w-full gap-6 rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 md:grid-cols-2"><div className="rounded-[1.5rem] border border-white/8 bg-black/30 p-8"><h1 className="text-4xl font-semibold">Seeded access</h1><p className="mt-4 text-gray-400">Founder account is prefilled so you can create and publish immediately.</p><div className="mt-6 space-y-3 text-sm text-gray-300"><div className="rounded-2xl border border-white/8 p-4">Founder: founder@stellaris.dev / secret-pass-founder</div><div className="rounded-2xl border border-white/8 p-4">Backer: backer1@stellaris.dev / secret-pass-backer1</div><div className="rounded-2xl border border-white/8 p-4">Admin: admin@stellaris.dev / secret-pass-admin</div></div></div><form onSubmit={submit} className="rounded-[1.5rem] border border-white/8 bg-black/40 p-8"><label className="block"><span className="mb-2 block text-sm text-gray-400">Email</span><input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 outline-none" /></label><label className="mt-5 block"><span className="mb-2 block text-sm text-gray-400">Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 outline-none" /></label>{error ? <div className="mt-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}<button disabled={busy} className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-4 font-medium text-black">{busy ? 'Signing In...' : 'Sign In'}<ArrowRight className="h-4 w-4" /></button></form></div></main>;
}
function Explore() {
  const { token } = useAuth();
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [selected, setSelected] = useState<CampaignDetail | null>(null);
  const [search, setSearch] = useState('');
  const [amount, setAmount] = useState('');
  const [state, setState] = useState<'idle' | 'funding' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void api.listCampaigns().then((r) => setCampaigns(r.campaigns)).catch((e) => setError(e instanceof ApiError ? e.message : 'Unable to load campaigns.')); }, []);
  const visible = useMemo(() => campaigns.filter((c) => [c.title, c.summary, c.category].join(' ').toLowerCase().includes(search.toLowerCase())), [campaigns, search]);
  const open = async (id: string) => {
    try { setSelected((await api.getCampaign(id)).campaign); setAmount(''); setState('idle'); setError(null); } catch (e) { setError(e instanceof ApiError ? e.message : 'Unable to load details.'); }
  };
  const fund = async () => {
    if (!selected || !token) { setError('Sign in with a backer or admin account to contribute.'); return; }
    try {
      const updated = await api.contribute(selected.id, { amount: Number(amount), assetType: 'USDC', paymentSource: 'WALLET' }, token);
      setSelected(updated.campaign);
      setCampaigns((cur) => cur.map((c) => c.id === updated.campaign.id ? updated.campaign : c));
      setState('done');
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Contribution failed.'); }
  };
  return <main className="mx-auto max-w-7xl px-6 py-16"><div className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between"><div><h1 className="text-5xl font-semibold tracking-tight">Live Campaigns</h1><p className="mt-4 max-w-2xl text-gray-400">Browse campaigns from the backend and fund them through the real contribution endpoint.</p></div><div className="relative"><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search campaigns" className="w-72 rounded-full border border-white/10 bg-white/5 py-3 pl-11 pr-5 text-sm outline-none" /></div></div>{error ? <div className="mb-6 rounded-3xl border border-red-500/20 bg-red-500/10 px-6 py-4 text-red-200">{error}</div> : null}<div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">{visible.map((c) => <button key={c.id} onClick={() => void open(c.id)} className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-7 text-left"><div className="mb-7 flex items-start justify-between"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10"><Layers className="h-5 w-5" /></div><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-gray-400">{c.category}</span></div><h3 className="text-2xl font-semibold">{c.title}</h3><p className="mt-3 line-clamp-3 text-sm text-gray-400">{c.summary}</p><div className="mt-8"><div className="mb-3 flex justify-between text-sm"><span>{compact(c.totalRaised, c.currency)} raised</span><span className="text-gray-500">{compact(c.goalAmount, c.currency)} goal</span></div><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-white" style={{ width: `${Math.max(0, Math.min(100, c.progressPercentage))}%` }} /></div><div className="mt-4 flex justify-between text-xs uppercase tracking-[0.2em] text-gray-500"><span>{Math.round(c.progressPercentage)}% funded</span><span>{daysLeft(c.fundingDeadline)} days left</span></div></div></button>)}</div>{selected ? <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 px-4 py-8"><motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-[2rem] border border-white/10 bg-[#090909] p-8"><div className="mb-8 flex items-start justify-between gap-6"><div><div className="mb-3 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-gray-400">{selected.category}</div><h2 className="text-4xl font-semibold">{selected.title}</h2><p className="mt-3 max-w-3xl text-gray-400">{selected.description}</p></div><button onClick={() => setSelected(null)} className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5"><X className="h-5 w-5" /></button></div><div className="grid gap-8 lg:grid-cols-[1.25fr_0.75fr]"><div><div className="grid gap-4 md:grid-cols-2">{[{ label: 'Founder Verification', value: selected.founderVerification?.kycStatus ?? 'PENDING' }, { label: 'Status', value: nice(selected.status) }, { label: 'Backers', value: String(selected.backerCount) }, { label: 'Deadline', value: new Date(selected.fundingDeadline).toLocaleDateString() }].map((item) => <div key={item.label} className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><div className="text-sm text-gray-500">{item.label}</div><div className="mt-2 text-lg font-medium">{item.value}</div></div>)}</div><div className="mt-6 rounded-[2rem] border border-white/10 bg-white/[0.02] p-6"><h3 className="text-xl font-semibold">Milestones</h3><div className="mt-5 space-y-4">{selected.milestones.map((m) => <div key={m.id} className="rounded-2xl border border-white/8 bg-black/30 p-4"><div className="flex items-center justify-between gap-4"><div><div className="font-medium">{m.position}. {m.title}</div><div className="mt-1 text-sm text-gray-400">{m.description}</div></div><div className="text-right text-sm text-gray-400"><div>{m.percentage}%</div><div>{nice(m.status)}</div></div></div></div>)}</div></div></div><div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6"><div className="text-4xl font-semibold">{compact(selected.totalRaised, selected.currency)}</div><div className="mt-2 text-sm text-gray-500">raised of {compact(selected.goalAmount, selected.currency)} goal</div><div className="my-6 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-white" style={{ width: `${Math.max(0, Math.min(100, selected.progressPercentage))}%` }} /></div>{state === 'done' ? <div className="py-8 text-center"><div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-green-500/20 bg-green-500/10 text-green-300"><CheckCircle2 className="h-8 w-8" /></div><div className="text-2xl font-semibold">Contribution saved</div><button onClick={() => setSelected(null)} className="mt-6 rounded-2xl border border-white/10 bg-white/10 px-6 py-3 font-medium">Done</button></div> : <div><div className="grid grid-cols-2 gap-4 text-center"><div className="rounded-2xl border border-white/8 bg-black/30 p-4"><div className="text-2xl font-semibold">{selected.backerCount}</div><div className="text-xs uppercase tracking-[0.2em] text-gray-500">Backers</div></div><div className="rounded-2xl border border-white/8 bg-black/30 p-4"><div className="text-2xl font-semibold">{daysLeft(selected.fundingDeadline)}</div><div className="text-xs uppercase tracking-[0.2em] text-gray-500">Days Left</div></div></div><div className="mt-6 space-y-4"><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Contribution amount" className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 outline-none" /><button onClick={() => void fund()} disabled={!amount} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-4 font-medium text-black disabled:opacity-50">Fund Campaign<ArrowRight className="h-4 w-4" /></button><p className="text-center text-xs text-gray-500">{token ? 'Posts directly to the backend contribution flow.' : 'Sign in with a backer account to contribute.'}</p></div></div>}</div></div></motion.div></div> : null}</main>;
}

function Create() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: '', summary: '', description: '', category: 'SaaS', goalAmount: '', milestoneOne: 'Prototype release with demo, docs, and initial validation.', milestoneTwo: 'Beta launch with onboarding, analytics, and pilot users.' });
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) { setError('Sign in as founder or admin to create a campaign.'); return; }
    setBusy(true); setError(null); setMsg(null);
    try {
      const payload = { title: form.title, summary: form.summary, description: form.description, category: form.category, goalAmount: Number(form.goalAmount), currency: 'INR', fundingDeadline: new Date(Date.now() + 30 * 86400000).toISOString(), milestones: [{ title: 'Prototype Release', description: form.milestoneOne, percentage: 40 }, { title: 'Beta Launch', description: form.milestoneTwo, percentage: 60 }] };
      const created = await api.createCampaign(payload, token);
      await api.publishCampaign(created.campaign.id, token);
      setMsg('Campaign created and published.');
      setTimeout(() => navigate('/founder'), 900);
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Unable to create campaign.'); } finally { setBusy(false); }
  };
  return <main className="mx-auto max-w-5xl px-6 py-16"><div className="mb-10"><h1 className="text-5xl font-semibold tracking-tight">Launch a real campaign</h1><p className="mt-4 max-w-3xl text-gray-400">This form now creates and publishes a backend campaign. Founder KYC still applies, so the seeded founder account is the fastest full-path test.</p></div><form onSubmit={submit} className="grid gap-6 rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 md:grid-cols-2"><label className="block"><span className="mb-2 block text-sm text-gray-400">Title</span><input value={form.title} onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 outline-none" required /></label><label className="block"><span className="mb-2 block text-sm text-gray-400">Category</span><input value={form.category} onChange={(e) => setForm((c) => ({ ...c, category: e.target.value }))} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 outline-none" required /></label><label className="block md:col-span-2"><span className="mb-2 block text-sm text-gray-400">Summary</span><input value={form.summary} onChange={(e) => setForm((c) => ({ ...c, summary: e.target.value }))} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 outline-none" required /></label><label className="block md:col-span-2"><span className="mb-2 block text-sm text-gray-400">Description</span><textarea value={form.description} onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))} className="min-h-40 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 outline-none" required /></label><label className="block"><span className="mb-2 block text-sm text-gray-400">Goal Amount (INR)</span><input type="number" value={form.goalAmount} onChange={(e) => setForm((c) => ({ ...c, goalAmount: e.target.value }))} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 outline-none" required /></label><div className="rounded-2xl border border-white/10 bg-black/30 p-5"><div className="text-sm text-gray-400">Publishing Account</div><div className="mt-2 text-lg font-medium">{user ? `${user.fullName} (${user.role})` : 'Not signed in'}</div><div className="mt-2 text-sm text-gray-500">Backend permissions and KYC are enforced at publish time.</div></div><label className="block md:col-span-2"><span className="mb-2 block text-sm text-gray-400">Milestone 1</span><textarea value={form.milestoneOne} onChange={(e) => setForm((c) => ({ ...c, milestoneOne: e.target.value }))} className="min-h-24 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 outline-none" required /></label><label className="block md:col-span-2"><span className="mb-2 block text-sm text-gray-400">Milestone 2</span><textarea value={form.milestoneTwo} onChange={(e) => setForm((c) => ({ ...c, milestoneTwo: e.target.value }))} className="min-h-24 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 outline-none" required /></label>{error ? <div className="md:col-span-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}{msg ? <div className="md:col-span-2 rounded-2xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-200">{msg}</div> : null}<div className="md:col-span-2"><button disabled={busy} className="flex items-center gap-2 rounded-2xl bg-white px-6 py-4 font-medium text-black disabled:opacity-70">{busy ? 'Deploying Campaign...' : 'Create & Publish Campaign'}<Zap className="h-4 w-4" /></button></div></form></main>;
}
function Founder() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [details, setDetails] = useState<CampaignDetail[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const load = async () => {
      try {
        const list = await api.listCampaigns();
        const mine = list.campaigns.filter((c) => user?.role === 'ADMIN' || c.founderId === user?.id);
        setCampaigns(mine);
        setDetails(await Promise.all(mine.map((c) => api.getCampaign(c.id).then((r) => r.campaign))));
      } catch (e) { setError(e instanceof ApiError ? e.message : 'Unable to load founder dashboard.'); }
    };
    void load();
  }, [user?.id, user?.role]);
  const totalRaised = campaigns.reduce((s, c) => s + c.totalRaised, 0);
  const totalBackers = campaigns.reduce((s, c) => s + c.backerCount, 0);
  const milestones = details.flatMap((c) => c.milestones);
  return <main className="mx-auto max-w-7xl px-6 py-16"><div className="mb-10"><h1 className="text-5xl font-semibold tracking-tight">Founder Hub</h1><p className="mt-4 max-w-3xl text-gray-400">Your founder dashboard now reads actual backend campaigns and milestone states.</p></div>{error ? <div className="mb-6 rounded-3xl border border-red-500/20 bg-red-500/10 px-6 py-4 text-red-200">{error}</div> : null}<div className="grid gap-6 md:grid-cols-4">{[{ label: 'Total Raised', value: money(totalRaised, campaigns[0]?.currency ?? 'INR'), icon: <Wallet className="h-5 w-5" /> }, { label: 'Backers', value: `${totalBackers} contributing backers`, icon: <Users className="h-5 w-5" /> }, { label: 'Campaigns', value: `${campaigns.length} visible campaigns`, icon: <Layers className="h-5 w-5" /> }, { label: 'Milestones', value: `${milestones.length} tracked milestones`, icon: <Lock className="h-5 w-5" /> }].map((item) => <div key={item.label} className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6"><div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">{item.icon}</div><h3 className="mb-2 text-xl font-semibold">{item.label}</h3><p className="text-sm text-gray-400">{item.value}</p></div>)}</div><div className="mt-10 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]"><div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6"><h2 className="text-2xl font-semibold">Campaign Performance</h2><div className="mt-6 space-y-4">{campaigns.map((c) => <div key={c.id} className="rounded-3xl border border-white/8 bg-black/30 p-5"><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><div className="text-xl font-medium">{c.title}</div><div className="mt-1 text-sm text-gray-400">{c.summary}</div></div><div className="text-right text-sm text-gray-400"><div>{money(c.totalRaised, c.currency)} raised</div><div>{c.backerCount} backers</div></div></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-white" style={{ width: `${Math.max(0, Math.min(100, c.progressPercentage))}%` }} /></div></div>)}</div></div><div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6"><h2 className="text-2xl font-semibold">Escrow Unlocks</h2><div className="mt-6 space-y-4">{milestones.map((m) => <div key={m.id} className="rounded-3xl border border-white/8 bg-black/30 p-5"><div className="flex items-center justify-between gap-4"><div><div className="font-medium">{m.title}</div><div className="mt-1 text-sm text-gray-400">{nice(m.status)}</div></div><div className="text-right text-sm text-gray-400"><div>{m.percentage}%</div><div>{money(m.currentlyUnlockableAmount, campaigns[0]?.currency ?? 'INR')}</div></div></div></div>)}</div></div></div></main>;
}

function Investor() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<CampaignDetail[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const load = async () => {
      try {
        const list = await api.listCampaigns();
        const full = await Promise.all(list.campaigns.map((c) => api.getCampaign(c.id).then((r) => r.campaign)));
        setCampaigns(full.filter((c) => c.contributions.some((x) => x.backerId === user?.id) || user?.role === 'ADMIN'));
      } catch (e) { setError(e instanceof ApiError ? e.message : 'Unable to load investor dashboard.'); }
    };
    void load();
  }, [user?.id, user?.role]);
  const acts = campaigns.flatMap((c) => c.contributions.filter((x) => x.backerId === user?.id || user?.role === 'ADMIN').map((x) => ({ c, x }))).sort((a, b) => new Date(b.x.createdAt).getTime() - new Date(a.x.createdAt).getTime());
  const invested = acts.reduce((s, a) => s + a.x.amount, 0);
  return <main className="mx-auto max-w-7xl px-6 py-16"><div className="mb-10"><h1 className="text-5xl font-semibold tracking-tight">Investor Hub</h1><p className="mt-4 max-w-3xl text-gray-400">Portfolio and activity are now derived from real contribution records in the backend.</p></div>{error ? <div className="mb-6 rounded-3xl border border-red-500/20 bg-red-500/10 px-6 py-4 text-red-200">{error}</div> : null}<div className="grid gap-6 md:grid-cols-3">{[{ label: 'Total Invested', value: money(invested, campaigns[0]?.currency ?? 'INR'), icon: <Wallet className="h-5 w-5" /> }, { label: 'Active Projects', value: `${campaigns.length} funded campaigns`, icon: <Layers className="h-5 w-5" /> }, { label: 'Recent Activity', value: `${acts.length} recorded contributions`, icon: <Users className="h-5 w-5" /> }].map((item) => <div key={item.label} className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6"><div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">{item.icon}</div><h3 className="mb-2 text-xl font-semibold">{item.label}</h3><p className="text-sm text-gray-400">{item.value}</p></div>)}</div><div className="mt-10 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]"><div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6"><h2 className="text-2xl font-semibold">Portfolio</h2><div className="mt-6 space-y-4">{campaigns.map((c) => { const own = c.contributions.filter((x) => x.backerId === user?.id || user?.role === 'ADMIN').reduce((s, x) => s + x.amount, 0); return <div key={c.id} className="rounded-3xl border border-white/8 bg-black/30 p-5"><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><div className="text-xl font-medium">{c.title}</div><div className="mt-1 text-sm text-gray-400">{c.category} • {nice(c.status)}</div></div><div className="text-right text-sm text-gray-400"><div>{money(own, c.currency)} invested</div><div>{Math.round(c.progressPercentage)}% campaign progress</div></div></div></div>; })}</div></div><div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6"><h2 className="text-2xl font-semibold">Recent Activity</h2><div className="mt-6 space-y-4">{acts.map(({ c, x }) => <div key={x.id} className="rounded-3xl border border-white/8 bg-black/30 p-5"><div className="font-medium">Funded {c.title}</div><div className="mt-2 text-sm text-gray-400">{money(x.amount, c.currency)} • {new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(Math.round((new Date(x.createdAt).getTime() - Date.now()) / 86400000), 'day')}</div></div>)}</div></div></div></main>;
}

function Pricing() {
  return <main className="mx-auto max-w-6xl px-6 py-16"><div className="text-center"><h1 className="text-5xl font-semibold tracking-tight">Simple pricing, backend-first workflow</h1><p className="mt-4 text-gray-400">The route is preserved, while the main work is now centered around the connected crowdfunding flows.</p></div><div className="mt-12 grid gap-6 md:grid-cols-2"><div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-8"><div className="text-sm uppercase tracking-[0.2em] text-gray-500">Basic</div><div className="mt-4 text-4xl font-semibold">Free</div><p className="mt-4 text-gray-400">Explore campaigns, contribute as a backer, and track backend-synced activity.</p></div><div className="rounded-[2rem] border border-white/20 bg-white/[0.05] p-8"><div className="text-sm uppercase tracking-[0.2em] text-gray-500">Founder</div><div className="mt-4 text-4xl font-semibold">Launch</div><p className="mt-4 text-gray-400">Create, publish, and manage milestone-backed campaigns through the API.</p></div></div></main>;
}

function ScrollReset({ children }: { children: ReactNode }) {
  const location = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);
  return <>{children}</>;
}

export default function App() {
  return <AuthProvider><Router><ScrollReset><Frame><Nav /><Routes><Route path="/" element={<Home />} /><Route path="/login" element={<Login />} /><Route path="/pricing" element={<Pricing />} /><Route path="/explore" element={<Gate><Explore /></Gate>} /><Route path="/create" element={<Gate><Create /></Gate>} /><Route path="/founder" element={<Gate><Founder /></Gate>} /><Route path="/investor" element={<Gate><Investor /></Gate>} /></Routes></Frame></ScrollReset></Router></AuthProvider>;
}

import React, { useState, useEffect, useRef } from "react";
import {
  Scale, Upload, FileText, CheckCircle2, XCircle, Pencil, Clock,
  AlertTriangle, ShieldCheck, LayoutDashboard, Inbox, Search,
  ChevronRight, CalendarDays, Building2, ArrowLeft, Sparkles, Loader2, LogOut,
} from "lucide-react";
import * as api from "./api";
import { useAuth } from "./auth/AuthContext";
import AuthPage from "./pages/AuthPage";
import { LanguageSwitcher } from "./components/LanguageSwitcher";
import { useTranslation } from "react-i18next";

function fmtDate(d, language = "en") {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(language === "hi" ? "hi-IN" : "en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr); target.setHours(0, 0, 0, 0);
  return Math.round((target - now) / 86400000);
}

export default function App() {
  const { token, user, logout } = useAuth();
  const { t } = useTranslation();
  const [view, setView] = useState("home");
  const [cases, setCases] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [activeCaseId, setActiveCaseId] = useState(null);
  const [activeCase, setActiveCase] = useState(null);
  const [actions, setActions] = useState([]);
  const [stats, setStats] = useState({ total_cases: 0, open_directives: 0, overdue: 0, compliance_rate: 0 });
  const [uploadState, setUploadState] = useState(null); // null | 'uploading' | 'error'
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef(null);

  const deptName = (id) => departments.find((d) => d.id === id)?.name || t("common.unassigned");

  async function refreshCases() {
    const res = await api.listCases();
    setCases(res.data);
  }
  async function refreshDepartments() {
    const res = await api.listDepartments();
    setDepartments(res.data);
  }
  async function refreshActions() {
    const [actionsRes, statsRes] = await Promise.all([api.listActions(), api.dashboardStats()]);
    setActions(actionsRes.data);
    setStats(statsRes.data);
  }
  async function refreshActiveCase(id) {
    const res = await api.getCase(id);
    setActiveCase(res.data);
  }

  // Only pull case/department/action data once someone is actually logged
  // in — otherwise these calls would just bounce off the backend as 401s.
  useEffect(() => {
    if (!token) return;
    refreshDepartments().catch(() => {});
    refreshCases().catch(() => {});
    refreshActions().catch(() => {});
  }, [token]);

  useEffect(() => {
    if (activeCaseId) refreshActiveCase(activeCaseId).catch(() => {});
  }, [activeCaseId]);

  async function handleFileSelected(file) {
    if (!file) return;
    setUploadState("uploading");
    setUploadError("");
    setView("intake");
    try {
      const res = await api.uploadJudgment(file);
      setActiveCaseId(res.data.id);
      setActiveCase(res.data);
      setUploadState(null);
      await refreshCases();
      setView("queue");
    } catch (err) {
      setUploadState("error");
      setUploadError(err?.response?.data?.detail || t("intake.backendError"));
    }
  }

  async function handleApprove(directiveId) {
    await api.approveDirective(directiveId);
    await refreshActiveCase(activeCaseId);
    await refreshCases();
    await refreshActions();
  }
  async function handleEditApprove(directiveId, edits) {
    await api.editApproveDirective(directiveId, edits);
    await refreshActiveCase(activeCaseId);
    await refreshCases();
    await refreshActions();
  }
  async function handleReject(directiveId, reason) {
    await api.rejectDirective(directiveId, reason);
    await refreshActiveCase(activeCaseId);
    await refreshCases();
  }
  async function handleStatusChange(actionId, status) {
    await api.updateActionStatus(actionId, status);
    await refreshActions();
  }

  const pendingQueueCount = cases.filter((c) => c.status === "pending_verification" || c.status === "verification_in_progress").length;

  if (!token || !user) {
    return <AuthPage />;
  }

  return (
    <div className="min-h-screen flex">
      <Sidebar view={view} setView={setView} pendingCount={pendingQueueCount} onUploadClick={() => fileInputRef.current?.click()} user={user} onLogout={logout} />
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => handleFileSelected(e.target.files?.[0])}
      />

      <div className="flex-1 px-9 py-7 overflow-y-auto">
        {view === "home" && <Home cases={cases} onUploadClick={() => fileInputRef.current?.click()} canUpload={UPLOAD_ROLES.includes(user?.role)} />}
        {view === "intake" && <IntakeProgress state={uploadState} error={uploadError} caseObj={activeCase} onRetry={() => fileInputRef.current?.click()} />}
        {view === "queue" && (
          <VerificationQueue
            cases={cases}
            activeCase={activeCase}
            setActiveCaseId={setActiveCaseId}
            departments={departments}
            deptName={deptName}
            onApprove={handleApprove}
            onEditApprove={handleEditApprove}
            onReject={handleReject}
            onDone={() => setView("actions")}
          />
        )}
        {view === "actions" && <ApprovedActions actions={actions} deptName={deptName} onOpenCase={(id) => { setActiveCaseId(id); setView("queue"); }} />}
        {view === "dashboard" && <Dashboard actions={actions} stats={stats} deptName={deptName} onStatusChange={handleStatusChange} />}
      </div>
    </div>
  );
}

const UPLOAD_ROLES = ["legal_officer", "admin_authority"];
const ROLE_LABELS = {
  legal_officer: "Legal Officer",
  admin_authority: "Administrative Authority",
  department_officer: "Department Officer",
  auditor: "Auditor",
};

function Sidebar({ view, setView, pendingCount, onUploadClick, user, onLogout }) {
  const { t } = useTranslation();
  const canUpload = UPLOAD_ROLES.includes(user?.role);
  const items = [
    { key: "home", label: t("nav.caseProcessor"), icon: Scale, action: () => setView("home") },
    { key: "intake", label: t("nav.caseIntake"), icon: Inbox, action: onUploadClick, disabled: !canUpload },
    { key: "queue", label: t("nav.verificationQueue"), icon: ShieldCheck, action: () => setView("queue"), badge: pendingCount },
    { key: "actions", label: t("nav.approvedActions"), icon: CheckCircle2, action: () => setView("actions") },
    { key: "dashboard", label: t("nav.dashboard"), icon: LayoutDashboard, action: () => setView("dashboard") },
  ];
  return (
    <div className="w-60 bg-navy text-paper p-5 flex flex-col gap-1">
      {/* Brand Header Stacked with Language Switcher */}
      <div className="flex flex-col gap-3.5 px-2 pb-6">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gold flex items-center justify-center shrink-0">
            <Scale size={17} className="text-navy" />
          </div>
          <div>
            <div className="font-serif text-lg font-bold leading-none">{t("brand.name")}</div>
            <div className="text-[10px] opacity-60 tracking-wide mt-0.5">{t("brand.tagline")}</div>
          </div>
        </div>
        
        {/* Language Switcher Row */}
        <div>
          <LanguageSwitcher />
        </div>
      </div>

      {/* Navigation Links */}
      {items.map((it) => {
        const Icon = it.icon;
        const active = view === it.key;
        return (
          <button
            key={it.key}
            onClick={it.disabled ? undefined : it.action}
            disabled={it.disabled}
            title={it.disabled ? t("nav.noIntakePermission") : undefined}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-left ${
              it.disabled
                ? "text-[#DCE3EA]/30 cursor-not-allowed"
                : active
                ? "bg-gold/20 border border-gold/40 text-[#EFD9A5]"
                : "border border-transparent text-[#DCE3EA] hover:bg-white/5"
            }`}
          >
            <Icon size={16} />
            <span className="flex-1">{it.label}</span>
            {!!it.badge && <span className="bg-danger text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">{it.badge}</span>}
          </button>
        );
      })}

      {/* Footer / User Details */}
      <div className="mt-auto border-t border-white/10 pt-3.5">
        <div className="px-2 mb-2.5">
          <div className="text-sm font-semibold text-[#EFD9A5] truncate">{user?.full_name}</div>
          <div className="text-[10.5px] opacity-60">{user?.role ? t(`roles.${user.role}`, { defaultValue: user.role }) : ""}</div>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-[#DCE3EA] hover:bg-white/5"
        >
          <LogOut size={15} />
          <span>{t("nav.logout")}</span>
        </button>
        <div className="text-[11px] opacity-40 px-2 pt-3">{import.meta.env.VITE_API_URL}</div>
      </div>
    </div>
  );
}

function Home({ cases, onUploadClick, canUpload }) {
  return (
    <div className="max-w-3xl">
      <div className="bg-gradient-to-br from-navy to-[#16304D] rounded-2xl p-10 text-paper relative overflow-hidden mb-7">
        <div className="absolute -right-8 -top-8 opacity-10"><Scale size={200} /></div>
        <div className="text-[11px] tracking-widest text-[#EFD9A5] font-semibold mb-2.5">AI FOR BHARAT · GOVERNANCE INFRASTRUCTURE</div>
        <h1 className="font-serif text-3xl leading-tight max-w-lg m-0">Transforming Court Judgments into Verified Government Action.</h1>
        <p className="text-sm opacity-85 mt-3.5 max-w-lg leading-relaxed">
          Bridge the critical gap between judicial orders and executive action. Every AI-extracted directive is reviewed by a human before it becomes official.
        </p>
        {canUpload ? (
          <button onClick={onUploadClick} className="mt-6 bg-gold text-navy font-bold text-sm px-5 py-2.5 rounded-lg flex items-center gap-2">
            <Upload size={15} /> Process New Judgment (upload a real PDF)
          </button>
        ) : (
          <div className="mt-6 text-xs opacity-70 flex items-center gap-2">
            <ShieldCheck size={14} /> Judgment intake is limited to Legal Officers and Administrative Authorities.
          </div>
        )}
      </div>

      <div className="font-serif text-base font-bold mb-3">Recent Cases</div>
      {cases.length === 0 ? (
        <EmptyState text="No judgments processed yet — upload a real PDF judgment to see the AI pipeline run." />
      ) : (
        <div className="flex flex-col gap-2">
          {cases.slice(0, 8).map((c) => (
            <div key={c.id} className="bg-white border border-[#E7E1D3] rounded-lg px-4 py-3 flex justify-between items-center">
              <div>
                <div className="font-semibold text-sm">{c.parties?.petitioner || "?"} vs. {c.parties?.respondent || "?"}</div>
                <div className="font-mono text-xs text-[#8A8371]">{c.case_number} · {c.court_name}</div>
              </div>
              <StatusPill status={c.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IntakeProgress({ state, error, caseObj, onRetry }) {
  const { t } = useTranslation();
  return (
    <div className="max-w-lg mt-16">
      <div className="font-serif text-xl font-bold mb-1">{t("intake.title")}</div>
      <div className="text-[#6B7280] text-sm mb-7">{t("intake.description")}</div>

      {state === "uploading" && (
        <div className="flex items-center gap-3 text-sm text-ink">
          <Loader2 size={18} className="animate-spin text-gold" />
          Uploading, extracting text (OCR if needed), and running AI analysis — this can take 20–60 seconds for a real document.
        </div>
      )}

      {state === "error" && (
        <div className="bg-[#F7E6E3] border border-[#E8BEB6] rounded-lg p-4 text-sm text-danger">
          <div className="font-semibold mb-1 flex items-center gap-2"><AlertTriangle size={15} /> {t("intake.failed")}</div>
          <div className="mb-3">{error}</div>
          <button onClick={onRetry} className="bg-danger text-white text-xs font-semibold px-3 py-2 rounded-md">{t("intake.retry")}</button>
        </div>
      )}

      {!state && caseObj && (
        <div className="text-sm text-okgreen flex items-center gap-2">
          <CheckCircle2 size={16} /> Ready — {caseObj.directives?.length || 0} directive(s) found.
        </div>
      )}
    </div>
  );
}

function VerificationQueue({ cases, activeCase, setActiveCaseId, departments, deptName, onApprove, onEditApprove, onReject, onDone }) {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [editDept, setEditDept] = useState("");
  const [editDeadline, setEditDeadline] = useState("");
  const [editText, setEditText] = useState("");
  const [busyId, setBusyId] = useState(null);

  const openQueueCases = cases.filter((c) => c.status === "pending_verification" || c.status === "verification_in_progress");

  if (!activeCase) {
    return (
      <div className="max-w-2xl">
        <div className="font-serif text-xl font-bold mb-4">{t("queue.title")}</div>
        {openQueueCases.length === 0 ? (
          <EmptyState text={t("queue.empty")} />
        ) : (
          <div className="flex flex-col gap-2">
            {openQueueCases.map((c) => (
              <button key={c.id} onClick={() => setActiveCaseId(c.id)} className="bg-white border border-[#E7E1D3] rounded-lg px-4 py-3 flex justify-between items-center text-left w-full">
                <div>
                  <div className="font-semibold text-sm">{c.parties?.petitioner} vs. {c.parties?.respondent}</div>
                  <div className="font-mono text-xs text-[#8A8371]">{c.case_number}</div>
                </div>
                <div className="text-xs text-gold font-semibold">
                  {c.directives.filter((d) => d.verification_status === "pending_verification").length} pending
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const directives = activeCase.directives || [];
  const resolvedCount = directives.filter((d) => d.verification_status !== "pending_verification").length;
  const total = directives.length;
  const allDone = total > 0 && resolvedCount === total;

  function startEdit(d) {
    setEditingId(d.id);
    setEditDept(d.suggested_department_id || "");
    setEditDeadline(d.deadline_date_computed || "");
    setEditText(d.raw_description);
  }
  async function saveEdit(d) {
    setBusyId(d.id);
    await onEditApprove(d.id, { raw_description: editText, suggested_department_id: editDept || null, deadline_date_computed: editDeadline || null });
    setEditingId(null);
    setBusyId(null);
  }
  async function doApprove(d) {
    setBusyId(d.id);
    await onApprove(d.id);
    setBusyId(null);
  }
  async function confirmReject(d) {
    setBusyId(d.id);
    await onReject(d.id, rejectReason || t("queue.defaultRejectionReason"));
    setRejectingId(null);
    setRejectReason("");
    setBusyId(null);
  }

  return (
    <div className="max-w-3xl">
      <button onClick={() => setActiveCaseId(null)} className="text-navy text-xs font-semibold flex items-center gap-1.5"><ArrowLeft size={14} /> {t("queue.allQueues")}</button>

      <div className="flex justify-between items-end mt-3.5 mb-1.5">
        <div>
          <div className="font-serif text-xl font-bold">{activeCase.parties?.petitioner} vs. {activeCase.parties?.respondent}</div>
          <div className="font-mono text-xs text-[#8A8371] mt-0.5">{activeCase.case_number} · {activeCase.court_name} · Order dated {fmtDate(activeCase.order_date)}</div>
        </div>
        <div className={`text-xs font-semibold ${allDone ? "text-okgreen" : "text-gold"}`}>{t("queue.verified", { resolved: resolvedCount, total })}</div>
      </div>

      <div className="h-1.5 bg-[#E7E1D3] rounded-full mb-5 overflow-hidden">
        <div className="h-full bg-okgreen transition-all" style={{ width: total ? `${(resolvedCount / total) * 100}%` : "0%" }} />
      </div>

      <div className="flex flex-col gap-3.5">
        {directives.map((d) => (
          <div key={d.id} className="bg-white border border-[#E7E1D3] rounded-xl p-4.5 p-[18px]">
            <div className="flex justify-between gap-3">
              <ConfidenceTag level={d.ai_confidence} />
              {d.verification_status !== "pending_verification" && (
                <span className={`text-[10.5px] font-bold uppercase tracking-wide ${d.verification_status === "rejected" ? "text-danger" : "text-okgreen"}`}>
                  {d.verification_status === "rejected" ? t("queue.rejected") : d.verification_status === "edited_approved" ? t("queue.editedApproved") : t("queue.approved")}
                </span>
              )}
            </div>

            {editingId === d.id ? (
              <div className="mt-2.5 flex flex-col gap-2.5">
                <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={2} className="border border-[#DCD5C0] rounded-md px-2.5 py-2 text-xs" />
                <div className="flex gap-2.5">
                  <select value={editDept} onChange={(e) => setEditDept(e.target.value)} className="border border-[#DCD5C0] rounded-md px-2.5 py-2 text-xs flex-1">
                    <option value="">Choose department…</option>
                    {departments.map((dep) => <option key={dep.id} value={dep.id}>{dep.name}</option>)}
                  </select>
                  <input type="date" value={editDeadline} onChange={(e) => setEditDeadline(e.target.value)} className="border border-[#DCD5C0] rounded-md px-2.5 py-2 text-xs flex-1" />
                </div>
                <div className="flex gap-2">
                  <button disabled={busyId === d.id} onClick={() => saveEdit(d)} className="bg-navy text-white text-xs font-semibold px-3.5 py-2 rounded-md flex items-center gap-1.5">
                    {busyId === d.id ? <Loader2 size={13} className="animate-spin" /> : null} Save & Approve
                  </button>
                  <button onClick={() => setEditingId(null)} className="bg-white border border-[#DCD5C0] text-xs font-semibold px-3.5 py-2 rounded-md">{t("queue.cancel")}</button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm leading-relaxed my-2.5 font-medium">{d.raw_description}</p>
                {d.source_snippet && (
                  <details className="mb-3">
                    <summary className="text-[11.5px] text-navy cursor-pointer font-semibold">View source · page {d.source_page || "?"}</summary>
                    <div className="font-mono text-[11.5px] bg-paper border border-[#E7E1D3] rounded-md p-2.5 mt-1.5 text-[#5A5646] leading-relaxed">"{d.source_snippet}"</div>
                  </details>
                )}
                <div className="flex gap-4 text-xs text-[#5A5646] mb-3.5 flex-wrap">
                  <span className="flex items-center gap-1.5"><Building2 size={13} /> {deptName(d.suggested_department_id)}</span>
                  <span className="flex items-center gap-1.5"><CalendarDays size={13} /> {fmtDate(d.deadline_date_computed)} <span className="opacity-60">({d.deadline_expression_raw || "no deadline stated"})</span></span>
                </div>

                {rejectingId === d.id ? (
                  <div className="flex gap-2">
                    <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason for rejection…" className="border border-[#DCD5C0] rounded-md px-2.5 py-2 text-xs flex-1" />
                    <button disabled={busyId === d.id} onClick={() => confirmReject(d)} className="bg-danger text-white text-xs font-semibold px-3.5 py-2 rounded-md">Confirm</button>
                    <button onClick={() => setRejectingId(null)} className="bg-white border border-[#DCD5C0] text-xs font-semibold px-3.5 py-2 rounded-md">Cancel</button>
                  </div>
                ) : d.verification_status === "pending_verification" ? (
                  <div className="flex gap-2">
                    <button disabled={busyId === d.id} onClick={() => doApprove(d)} className="bg-navy text-white text-xs font-semibold px-3.5 py-2 rounded-md flex items-center gap-1.5">
                      {busyId === d.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Approve
                    </button>
                    <button onClick={() => startEdit(d)} className="bg-white border border-[#DCD5C0] text-xs font-semibold px-3.5 py-2 rounded-md flex items-center gap-1.5"><Pencil size={13} /> Edit</button>
                    <button onClick={() => setRejectingId(d.id)} className="bg-white border border-[#E8BEB6] text-danger text-xs font-semibold px-3.5 py-2 rounded-md flex items-center gap-1.5"><XCircle size={13} /> Reject</button>
                  </div>
                ) : d.verification_status === "rejected" ? (
                  <div className="text-xs text-[#B91C1C]">Reason: {d.rejection_reason}</div>
                ) : null}
              </>
            )}
          </div>
        ))}
      </div>

      {allDone && (
        <div className="mt-5 bg-[#EAF3EE] border border-[#BFE0CC] rounded-xl px-4.5 py-4 flex justify-between items-center">
          <div className="text-sm text-[#215C42] font-semibold flex items-center gap-2"><ShieldCheck size={16} /> All directives reviewed — case marked as actioned.</div>
          <button onClick={onDone} className="bg-navy text-white text-xs font-semibold px-3.5 py-2 rounded-md">View Approved Actions</button>
        </div>
      )}
    </div>
  );
}

function ApprovedActions({ actions, deptName, onOpenCase }) {
  const { t } = useTranslation();
  return (
    <div className="max-w-3xl">
      <div className="font-serif text-xl font-bold mb-1">{t("actions.title")}</div>
      <p className="text-[#6B7280] text-sm mb-5">{t("actions.description")}</p>
      {actions.length === 0 ? (
        <EmptyState text={t("actions.empty")} />
      ) : (
        <div className="flex flex-col gap-2">
          {actions.map((a) => (
            <button key={a.id} onClick={() => onOpenCase(a.case_id)} className="bg-white border border-[#E7E1D3] rounded-lg px-4 py-3 flex justify-between items-center text-left w-full">
              <div className="flex-1">
                <div className="font-semibold text-sm mb-0.5">{a.description}</div>
                <div className="font-mono text-xs text-[#8A8371]">{deptName(a.assigned_department_id)}</div>
              </div>
              <div className="text-xs text-[#5A5646] flex items-center gap-1.5"><Clock size={12} /> {fmtDate(a.deadline_date)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Dashboard({ actions, stats, deptName, onStatusChange }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const enriched = actions.map((a) => {
    const isOverdue = a.status !== "completed" && daysUntil(a.deadline_date) < 0;
    return { ...a, computedStatus: a.status === "completed" ? "completed" : isOverdue ? "overdue" : a.status };
  });
  const filtered = enriched.filter((a) => {
    const matchesSearch = !search || a.description.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "all" || a.computedStatus === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div>
      <div className="font-serif text-xl font-bold mb-4">{t("dashboard.title")}</div>

      <div className="grid grid-cols-4 gap-3 mb-5.5 mb-6">
        <StatCard label={t("dashboard.totalCases")} value={stats.total_cases} icon={Scale} />
        <StatCard label={t("dashboard.openDirectives")} value={stats.open_directives} icon={Inbox} />
        <StatCard label={t("dashboard.overdue")} value={stats.overdue} icon={AlertTriangle} tone="red" />
        <StatCard label={t("dashboard.complianceRate")} value={`${stats.compliance_rate}%`} icon={ShieldCheck} tone="green" />
      </div>

      <div className="flex gap-2.5 mb-3.5">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-2.5 text-[#9CA3AF]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search directive text…" className="border border-[#DCD5C0] rounded-md pl-8 pr-2.5 py-2 text-xs w-full" />
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="border border-[#DCD5C0] rounded-md px-2.5 py-2 text-xs">
          <option value="all">{t("dashboard.allStatuses")}</option>
          <option value="pending">{t("status.pending")}</option>
          <option value="in_progress">{t("status.in_progress")}</option>
          <option value="completed">{t("status.completed")}</option>
          <option value="overdue">{t("status.overdue")}</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState text={t("dashboard.empty")} />
      ) : (
        <div className="bg-white border border-[#E7E1D3] rounded-xl overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-paper text-left">
                {["Directive", "Department", "Deadline", "Status", ""].map((h) => (
                  <th key={h} className="px-3.5 py-2.5 font-semibold text-[11.5px] text-[#8A8371] uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-t border-[#F0EBDB]">
                  <td className="px-3.5 py-2.5 max-w-xs">{a.description}</td>
                  <td className="px-3.5 py-2.5 text-[#5A5646]">{deptName(a.assigned_department_id)}</td>
                  <td className="px-3.5 py-2.5 whitespace-nowrap">{fmtDate(a.deadline_date)}</td>
                  <td className="px-3.5 py-2.5"><StatusPill status={a.computedStatus} /></td>
                  <td className="px-3.5 py-2.5">
                    {a.computedStatus !== "completed" && (
                      <select value={a.status} onChange={(e) => onStatusChange(a.id, e.target.value)} className="border border-[#DCD5C0] rounded-md px-2 py-1 text-[11.5px]">
                        <option value="pending">Pending</option>
                        <option value="in_progress">In progress</option>
                        <option value="completed">Completed</option>
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone }) {
  const color = tone === "red" ? "text-danger" : tone === "green" ? "text-okgreen" : "text-navy";
  return (
    <div className="bg-white border border-[#E7E1D3] rounded-xl px-4 py-3.5">
      <div className="flex justify-between items-center">
        <div className="text-[11px] text-[#8A8371] font-semibold uppercase tracking-wide">{label}</div>
        <Icon size={14} className={color} />
      </div>
      <div className={`font-serif text-2xl font-bold mt-1 ${color}`}>{value}</div>
    </div>
  );
}

function StatusPill({ status }) {
  const { t } = useTranslation();
  const map = {
    uploaded: ["text-[#5A5646]", "bg-[#EFEADA]"],
    extracting: ["text-gold", "bg-[#FBF0DA]"],
    pending_verification: ["text-gold", "bg-[#FBF0DA]"],
    verification_in_progress: ["text-gold", "bg-[#FBF0DA]"],
    actioned: ["text-okgreen", "bg-[#E4F3EA]"],
    extraction_failed: ["text-danger", "bg-[#F7E6E3]"],
    pending: ["text-gold", "bg-[#FBF0DA]"],
    in_progress: ["text-navy", "bg-[#E3EAF1]"],
    completed: ["text-okgreen", "bg-[#E4F3EA]"],
    overdue: ["text-danger", "bg-[#F7E6E3]"],
  };
  const [fg, bg] = map[status] || ["text-[#5A5646]", "bg-[#EFEADA]"];
  return <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full capitalize whitespace-nowrap ${fg} ${bg}`}>{t(`status.${status}`, { defaultValue: (status || "").replace(/_/g, " ") })}</span>;
}

function ConfidenceTag({ level }) {
  const map = {
    high: ["text-okgreen", "bg-[#E4F3EA]", "High confidence"],
    medium: ["text-gold", "bg-[#FBF0DA]", "Medium confidence"],
    low: ["text-danger", "bg-[#F7E6E3]", "Low confidence — review closely"],
  };
  const [fg, bg, label] = map[level] || map.medium;
  return <span className={`text-[10.5px] font-bold px-2 py-1 rounded-md inline-flex items-center gap-1 ${fg} ${bg}`}><Sparkles size={10} /> {label}</span>;
}

function EmptyState({ text }) {
  return <div className="border border-dashed border-[#C9BFA8] rounded-xl p-7 text-center text-[#6B7280] text-sm">{text}</div>;
}
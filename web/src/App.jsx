import { useEffect, useMemo, useState } from "react";

import { api } from "./api.js";

const NAV_ITEMS = [
  { id: "generate", label: "智能任务生成", note: "新建批次" },
  { id: "history-categories", label: "智能任务列表", note: "分类 / 批次 / 任务" },
  { id: "queue-categories", label: "任务列表", note: "分类 / 正式任务" },
  { id: "settings", label: "配置中心", note: "仓库与执行器" },
];

const PAGE_META = {
  generate: {
    title: "智能任务生成",
    subtitle: "这里只处理本次智能任务生成，不混入历史批次和正式任务。",
  },
  "history-categories": {
    title: "智能任务列表",
    subtitle: "先看分类卡片，再进入分类下的批次卡片，最后进入该批次对应的任务列表。",
  },
  "history-batches": {
    title: "分类批次",
    subtitle: "当前页只展示某个分类下的批次卡片，详情、编辑和日志都通过按钮进入独立层。",
  },
  "history-tasks": {
    title: "批次任务列表",
    subtitle: "这里只展示当前批次的任务列表字段，详情和编辑动作在独立页处理。",
  },
  "batch-detail": {
    title: "批次详情",
    subtitle: "独立详情页只查看当前批次摘要和日志入口，不和编辑表单混排。",
  },
  "batch-edit": {
    title: "编辑批次",
    subtitle: "独立编辑页处理当前批次的标题、摘要、顺序、排期和确认操作。",
  },
  "queue-categories": {
    title: "任务列表",
    subtitle: "先按分类卡片进入，再查看该分类下的正式任务列表。",
  },
  "queue-tasks": {
    title: "分类任务列表",
    subtitle: "列表页只展示任务字段，详情、编辑、删除和日志都通过按钮进入。",
  },
  "task-detail": {
    title: "任务详情",
    subtitle: "独立详情页只看当前任务的来源、排期、状态和最近执行结果。",
  },
  "task-edit": {
    title: "编辑任务",
    subtitle: "独立编辑页处理标题、日期、知识点和执行动作。",
  },
  settings: {
    title: "配置中心",
    subtitle: "仓库路径、默认计划池、执行器配置统一放在这里。",
  },
};

const initialRepository = {
  path: "E:\\idea_space\\blog",
  branch: "main",
  docsDir: "_docs",
  autoPush: true,
};

const initialDraftForm = {
  categoryName: "",
  goal: "",
  executorId: "codex-default",
  itemCount: 12,
};

const initialCategoryForm = {
  name: "",
  enabled: true,
  isDefaultPool: false,
};

const taskStatusTabs = [
  { id: "pending", label: "待执行" },
  { id: "completed", label: "已执行" },
];

function rootKeyForScreen(screen) {
  if (screen.startsWith("history")) return "history-categories";
  if (screen.startsWith("batch")) return "history-categories";
  if (screen.startsWith("queue")) return "queue-categories";
  if (screen.startsWith("task")) return "queue-categories";
  return screen;
}

function statusTone(status) {
  if (status === "running" || status === "ready" || status === "pending") return "accent";
  if (status === "done" || status === "success" || status === "confirmed") return "success";
  if (status === "failed") return "danger";
  return "default";
}

function statusText(status) {
  const map = {
    draft: "草稿",
    running: "执行中",
    ready: "待确认",
    confirmed: "已确认",
    pending: "待执行",
    done: "已完成",
    failed: "已失败",
    success: "成功",
  };

  return map[status] || status;
}

function taskTypeText(taskType) {
  return taskType === "default_random" ? "系统默认任务" : "排期任务";
}

function categorySourceText(source) {
  if (source === "manual") return "手动创建";
  if (source === "blog_scan") return "仓库扫描";
  return source || "未知来源";
}

function formatDate(dateText) {
  if (!dateText) {
    return "未排期";
  }

  const date = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return dateText;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatDateTime(dateText) {
  if (!dateText) {
    return "暂无时间";
  }

  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) {
    return dateText;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatFullDate(dateText) {
  if (!dateText) {
    return "暂无时间";
  }

  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) {
    return dateText;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function LogoMark() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <rect x="6" y="6" width="28" height="28" rx="10" fill="currentColor" opacity="0.12" />
      <path
        d="M13 13.5h12a2.5 2.5 0 0 1 2.5 2.5v10H17a3 3 0 0 0-3 3zM17 13.5V28"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NavIcon({ id }) {
  const map = {
    generate: "M10 12h20M10 20h14M10 28h10M28 18v10M23 23h10",
    "history-categories": "M12 10h16v20H12zM16 15h8M16 21h8M16 27h5",
    "queue-categories": "M12 11h16M12 20h16M12 29h10M28 26l3 3 5-6",
    settings:
      "M20 10.5l2.8 1.1 2.7-.7 1.5 2.5-1.7 2.2.2 2.8 2.2 1.6-1.1 2.8-2.8.2-1.8 2.1 1 2.6-2.7 1.1-2-1.8-2.8.2-1.1-2.7 2.2-1.6.2-2.8-1.7-2.2 1.5-2.5 2.7.7zM20 17a3.2 3.2 0 1 0 0 6.4A3.2 3.2 0 0 0 20 17z",
  };

  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <path
        d={map[id]}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StatusPill({ tone = "default", children }) {
  return <span className={`status-pill status-pill-${tone}`}>{children}</span>;
}

function ToolbarButton({ children, primary = false, danger = false, onClick, disabled = false }) {
  return (
    <button
      type="button"
      className={[
        "toolbar-btn",
        primary ? "toolbar-btn-primary" : "",
        danger ? "toolbar-btn-danger" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function ActionIcon({ children, onClick, danger = false, disabled = false }) {
  return (
    <button
      type="button"
      className={["action-icon", danger ? "action-icon-danger" : ""].filter(Boolean).join(" ")}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function Modal({ visible, title, subtitle, onClose, children }) {
  if (!visible) {
    return null;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3>{title}</h3>
            <p>{subtitle}</p>
          </div>
          <button className="modal-close" type="button" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function ConfirmModal({ visible, title, message, onConfirm, onCancel, loading = false }) {
  if (!visible) {
    return null;
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card max-w-sm" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3>{title || "确认操作"}</h3>
            <p>{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "处理中..." : "确认"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterBar({ label, items, activeId, onChange }) {
  return (
    <div className="filter-bar">
      <span>{label}</span>
      <div className="filter-pills">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`filter-pill ${activeId === item.id ? "active" : ""}`}
            onClick={() => onChange(item.id)}
          >
            {item.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ title, meta, desc, latest, status, actions }) {
  return (
    <article className="summary-card">
      <div className="summary-card-head">
        <div>
          <h4>{title}</h4>
          <p>{meta}</p>
        </div>
        <span className="star-mark">★</span>
      </div>
      <p className="summary-desc">{desc}</p>
      <div className="summary-inline">{latest}</div>
      <div className="summary-card-foot">
        <StatusPill tone={statusTone(status)}>{status}</StatusPill>
        <div className="card-actions">{actions}</div>
      </div>
    </article>
  );
}

function cloneTask(task) {
  if (!task) {
    return null;
  }

  return {
    ...task,
    items: task.items.map((item) => ({ ...item })),
  };
}

function IconBot() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="6" y="8" width="12" height="10" rx="3" />
      <path d="M12 4v4M9 13h.01M15 13h.01M9.5 16h5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSend() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 12 20 4 14 20l-2.5-5.5L4 12Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M20 12a8 8 0 1 1-2.34-5.66L20 9M20 4v5h-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2 6a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconArrowRight() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18M8 2v4M16 2v4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconFileText() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconPlusCircle() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v8M8 12h8" strokeLinecap="round" />
    </svg>
  );
}

export function App() {
  const [screen, setScreen] = useState("queue-categories");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState("default");
  const [repository, setRepository] = useState(initialRepository);
  const [categories, setCategories] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [runs, setRuns] = useState([]);
  const [executors, setExecutors] = useState([]);
  const [defaultPlan, setDefaultPlan] = useState({ enabled: true, defaultExecutorId: "codex-default", autoScheduleEnabled: false });
  const [categoryForm, setCategoryForm] = useState(initialCategoryForm);
  const [draftForm, setDraftForm] = useState(initialDraftForm);
  const [generatedDraftId, setGeneratedDraftId] = useState(null);
  const [generatedItems, setGeneratedItems] = useState([]);
  const [historyCategory, setHistoryCategory] = useState("");
  const [queueCategory, setQueueCategory] = useState("");
  const [queueStatus, setQueueStatus] = useState("pending");
  const [currentBatchId, setCurrentBatchId] = useState(null);
  const [currentBatchItems, setCurrentBatchItems] = useState([]);
  const [currentTaskId, setCurrentTaskId] = useState(null);
  const [taskEditor, setTaskEditor] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [executorTest, setExecutorTest] = useState({
    executorId: "codex-default",
    promptContent: "你好，请用一句中文确认你已经成功接收到这条测试命令。",
    result: null,
  });
  const [confirmModal, setConfirmModal] = useState({
    visible: false,
    title: "",
    message: "",
    onConfirm: null,
  });
  const [logModal, setLogModal] = useState({
    visible: false,
    title: "",
    subtitle: "",
    lines: [],
  });

  async function runAction(successMessage, callback) {
    setLoading(true);
    try {
      const result = await callback();
      if (successMessage) {
        setMessage(successMessage);
        setMessageTone("success");
      }
      return result;
    } catch (error) {
      setMessage(error.message);
      setMessageTone("danger");
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function fetchCoreData() {
    const [
      repositoryPayload,
      categoriesPayload,
      draftsPayload,
      tasksPayload,
      runsPayload,
      executorsPayload,
      defaultPlanPayload,
    ] = await Promise.all([
      api.getRepository(),
      api.listCategories(),
      api.listDrafts(),
      api.listTasks(),
      api.listRuns(),
      api.listExecutors(),
      api.getDefaultPlan(),
    ]);

    setRepository(repositoryPayload);
    setCategories(categoriesPayload);
    setDrafts(draftsPayload);
    setTasks(tasksPayload);
    setRuns(runsPayload);
    setExecutors(executorsPayload);
    setDefaultPlan(defaultPlanPayload);

    const enabledCategories = categoriesPayload.filter((category) => category.enabled);

    const defaultExecutorId =
      executorsPayload.find((executor) => executor.enabled)?.id ||
      executorsPayload[0]?.id ||
      "codex-default";

    setDraftForm((current) => ({
      ...current,
      categoryName:
        current.categoryName && categoriesPayload.some((category) => category.name === current.categoryName)
          ? current.categoryName
          : enabledCategories[0]?.name || categoriesPayload[0]?.name || "",
      executorId: current.executorId || defaultExecutorId,
    }));

    setExecutorTest((current) => ({
      ...current,
      executorId: executorsPayload.some((executor) => executor.id === current.executorId)
        ? current.executorId
        : defaultExecutorId,
    }));
  }

  useEffect(() => {
    void runAction("", fetchCoreData);
  }, []);

  const historyCategoryCards = useMemo(() => {
    const groups = new Map();
    drafts.forEach((draft) => {
      const current = groups.get(draft.categoryName) || {
        id: draft.categoryName,
        name: draft.categoryName,
        batchCount: 0,
        itemCount: 0,
        pendingCount: 0,
        latestDraft: draft,
      };
      current.batchCount += 1;
      current.itemCount += draft.itemCount || 0;
      if (draft.status === "ready") {
        current.pendingCount += 1;
      }
      if (!current.latestDraft || current.latestDraft.updatedAt < draft.updatedAt) {
        current.latestDraft = draft;
      }
      groups.set(draft.categoryName, current);
    });

    return Array.from(groups.values()).sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  }, [drafts]);

  const queueCategoryCards = useMemo(() => {
    const groups = new Map();
    tasks.forEach((task) => {
      const current = groups.get(task.categoryName) || {
        id: task.categoryName,
        name: task.categoryName,
        pendingCount: 0,
        completedCount: 0,
        defaultCount: 0,
      };
      if (task.status === "pending" || task.status === "running") {
        current.pendingCount += 1;
      } else {
        current.completedCount += 1;
      }
      if (task.taskType === "default_random") {
        current.defaultCount += 1;
      }
      groups.set(task.categoryName, current);
    });

    return Array.from(groups.values()).sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  }, [tasks]);

  const enabledCategories = useMemo(
    () => categories.filter((category) => category.enabled),
    [categories],
  );

  const defaultPoolCategories = useMemo(
    () => categories.filter((category) => category.enabled && category.isDefaultPool),
    [categories],
  );

  const defaultTask = useMemo(
    () => tasks.find((task) => task.taskType === "default_random") || null,
    [tasks],
  );

  useEffect(() => {
    if (!historyCategoryCards.length) {
      setHistoryCategory("");
      return;
    }
    if (!historyCategoryCards.some((item) => item.id === historyCategory)) {
      setHistoryCategory(historyCategoryCards[0].id);
    }
  }, [historyCategoryCards, historyCategory]);

  useEffect(() => {
    if (!queueCategoryCards.length) {
      setQueueCategory("");
      return;
    }
    if (!queueCategoryCards.some((item) => item.id === queueCategory)) {
      setQueueCategory(queueCategoryCards[0].id);
    }
  }, [queueCategoryCards, queueCategory]);

  const batchCards = useMemo(
    () =>
      drafts
        .filter((draft) => draft.categoryName === historyCategory)
        .sort((left, right) => (right.updatedAt || "").localeCompare(left.updatedAt || "")),
    [drafts, historyCategory],
  );

  useEffect(() => {
    if (!batchCards.length) {
      setCurrentBatchId(null);
      setCurrentBatchItems([]);
      return;
    }
    if (!batchCards.some((item) => item.id === currentBatchId)) {
      setCurrentBatchId(batchCards[0].id);
    }
  }, [batchCards, currentBatchId]);

  useEffect(() => {
    if (!currentBatchId) {
      setCurrentBatchItems([]);
      return;
    }

    void api.getDraftItems(currentBatchId).then(setCurrentBatchItems).catch((error) => {
      setMessage(error.message);
      setMessageTone("danger");
      setCurrentBatchItems([]);
    });
  }, [currentBatchId]);

  const currentBatch = useMemo(
    () => drafts.find((draft) => draft.id === currentBatchId) || null,
    [drafts, currentBatchId],
  );

  const queueTasks = useMemo(() => {
    const filterFn =
      queueStatus === "pending"
        ? (task) => task.status === "pending" || task.status === "running"
        : (task) => task.status === "done" || task.status === "failed";

    return tasks
      .filter((task) => task.categoryName === queueCategory)
      .filter(filterFn)
      .sort((left, right) => (left.scheduledDate || "9999-12-31").localeCompare(right.scheduledDate || "9999-12-31"));
  }, [queueCategory, queueStatus, tasks]);

  useEffect(() => {
    if (!queueTasks.length) {
      setCurrentTaskId(null);
      return;
    }
    if (!queueTasks.some((task) => task.id === currentTaskId)) {
      setCurrentTaskId(queueTasks[0].id);
    }
  }, [queueTasks, currentTaskId]);

  const currentTask = useMemo(
    () => tasks.find((task) => task.id === currentTaskId) || null,
    [tasks, currentTaskId],
  );

  useEffect(() => {
    setTaskEditor(cloneTask(currentTask));
  }, [currentTask]);

  const generatedDraft = useMemo(
    () => drafts.find((draft) => draft.id === generatedDraftId) || null,
    [drafts, generatedDraftId],
  );

  const latestDraftRun = useMemo(
    () => runs.find((run) => run.draftId === currentBatchId) || null,
    [runs, currentBatchId],
  );

  const latestTaskRun = useMemo(
    () => runs.find((run) => run.taskId === currentTaskId) || null,
    [runs, currentTaskId],
  );

  function buildDraftLogLines(draft) {
    return [
      draft.promptText ? `Prompt: ${draft.promptText}` : null,
      draft.resultText ? `Result: ${draft.resultText}` : null,
      draft.stdoutText ? `Stdout: ${draft.stdoutText}` : null,
      draft.stderrText ? `Stderr: ${draft.stderrText}` : null,
    ].filter(Boolean);
  }

  function buildRunLogLines(run) {
    return [
      run?.promptText ? `Prompt: ${run.promptText}` : null,
      run?.resultText ? `Result: ${run.resultText}` : null,
      run?.stdoutText ? `Stdout: ${run.stdoutText}` : null,
      run?.stderrText ? `Stderr: ${run.stderrText}` : null,
    ].filter(Boolean);
  }

  function openLogModal(title, subtitle, lines) {
    setLogModal({
      visible: true,
      title,
      subtitle,
      lines: lines.length > 0 ? lines : ["暂无日志内容。"],
    });
  }

  async function handleRefresh() {
    await runAction("数据已刷新。", fetchCoreData);
  }

  async function handleGenerateDraft() {
    const payload = await runAction("智能任务已生成。", async () => {
      const response = await api.generateDraft(draftForm);
      await fetchCoreData();
      return response;
    });

    if (payload) {
      setGeneratedDraftId(payload.draftId);
      setGeneratedItems(payload.items);
      setHistoryCategory(draftForm.categoryName);
      setCurrentBatchId(payload.draftId);
    }
  }

  function updateGeneratedItem(itemId, field, value) {
    setGeneratedItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, [field]: value } : item)),
    );
  }

  async function saveDraftItem(item) {
    await runAction("草稿任务已保存。", async () => {
      await api.updateDraftItem(item.id, {
        title: item.title,
        contentBrief: item.contentBrief,
        orderNo: item.orderNo,
        scheduledDate: item.scheduledDate || null,
      });
      const items = await api.getDraftItems(item.draftId);
      if (item.draftId === generatedDraftId) {
        setGeneratedItems(items);
      }
      if (item.draftId === currentBatchId) {
        setCurrentBatchItems(items);
      }
      await fetchCoreData();
    });
  }

  async function handleConfirmDraft(draftId) {
    const draft = drafts.find((item) => item.id === draftId);
    const payload = await runAction("草稿已确认并进入任务列表。", async () => {
      const response = await api.confirmDraft(draftId);
      await fetchCoreData();
      return response;
    });

    if (payload && draft) {
      setQueueCategory(draft.categoryName);
      setQueueStatus("pending");
      setCurrentTaskId(payload.createdTaskIds?.[0] || null);
      setScreen("queue-tasks");
    }
  }

  function showConfirm(title, message, onConfirm) {
    setConfirmModal({ visible: true, title, message, onConfirm });
  }

  async function handleDeleteDraft(draftId) {
    showConfirm("删除草稿批次", "确认删除该草稿批次吗？该批次下的所有任务项也会一并删除。", async () => {
      await runAction("草稿批次已删除。", async () => {
        await api.deleteDraft(draftId);
        await fetchCoreData();
        setConfirmModal({ visible: false, title: "", message: "", onConfirm: null });
      });

      if (generatedDraftId === draftId) {
        setGeneratedDraftId(null);
        setGeneratedItems([]);
      }
    });
  }

  async function handleDeleteDraftItem(itemId) {
    showConfirm("删除任务项", "确认删除该条任务吗？此操作不可撤消。", async () => {
      await runAction("任务项已删除。", async () => {
        await api.deleteDraftItem(itemId);
        const items = await api.getDraftItems(currentBatchId);
        setCurrentBatchItems(items);
        await fetchCoreData();
        setConfirmModal({ visible: false, title: "", message: "", onConfirm: null });
      });
    });
  }

  async function handlePushDraftItem(item) {
    await runAction("任务已加入任务列表。", async () => {
      await api.confirmDraftItem(item.id);
      await fetchCoreData();
      const items = await api.getDraftItems(currentBatchId);
      setCurrentBatchItems(items);
    });
  }

  function updateTaskEditorItem(itemId, field, value) {
    setTaskEditor((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        items: current.items.map((item) => (item.id === itemId ? { ...item, [field]: value } : item)),
      };
    });
  }

  async function handleSaveTask() {
    if (!taskEditor) {
      return;
    }

    const payload = await runAction("任务已更新。", async () => {
      const response = await api.updateTask(taskEditor.id, {
        title: taskEditor.title,
        scheduledDate: taskEditor.scheduledDate || null,
        items: taskEditor.items.map((item) => ({
          id: item.id,
          title: item.title,
          contentBrief: item.contentBrief,
          orderNo: item.orderNo,
        })),
      });
      await fetchCoreData();
      return response;
    });

    if (payload) {
      setCurrentTaskId(payload.id);
    }
  }

  async function handleDeleteTask(taskId) {
    showConfirm("删除任务", "确认删除该任务吗？此操作不可撤消。", async () => {
      await runAction("任务已删除。", async () => {
        await api.deleteTask(taskId);
        await fetchCoreData();
        setConfirmModal({ visible: false, title: "", message: "", onConfirm: null });
      });
    });
  }

  async function handleRunTask(taskId) {
    const executorId =
      defaultPlan.defaultExecutorId ||
      executors.find((executor) => executor.enabled)?.id ||
      executors[0]?.id;

    if (!executorId) {
      setMessage("当前没有可用执行器。");
      setMessageTone("danger");
      return;
    }

    const result = await runAction("任务已提交执行。", async () => {
      const response = await api.runTask(taskId, { executorId });
      await fetchCoreData();
      return response;
    });

    if (result) {
      setCurrentTaskId(taskId);
      setScreen("task-detail");
    }
  }

  async function handleCreateDefaultTask() {
    const payload = await runAction("系统默认任务已同步。", async () => {
      const response = await api.createDefaultTask();
      await fetchCoreData();
      return response;
    });

    if (payload) {
      setQueueCategory(payload.categoryName);
      setCurrentTaskId(payload.id);
      setScreen("queue-tasks");
    }
  }

  async function handleScanRepository() {
    const payload = await runAction("仓库分类与文章索引已刷新。", async () => {
      const response = await api.scanRepository();
      await fetchCoreData();
      return response;
    });

    if (payload) {
      setMessage(`仓库扫描完成，发现 ${payload.categories?.length || 0} 个分类，索引 ${payload.articles?.length || 0} 篇文章。`);
      setMessageTone("success");
    }
  }

  async function handleSaveRepository() {
    await runAction("仓库配置已保存。", async () => {
      const payload = await api.saveRepository(repository);
      setRepository(payload);
    });
  }

  async function handleSaveDefaultPlan() {
    await runAction("默认计划已保存。", async () => {
      const payload = await api.saveDefaultPlan(defaultPlan);
      setDefaultPlan(payload.settings || payload);
      await fetchCoreData();
    });
  }

  async function handleCreateCategory() {
    const categoryName = categoryForm.name.trim();
    if (!categoryName) {
      setMessage("分类名称不能为空。");
      setMessageTone("danger");
      return;
    }

    const payload = await runAction("自定义分类已创建。", async () => {
      const response = await api.createCategory({
        name: categoryName,
        enabled: categoryForm.enabled,
        isDefaultPool: categoryForm.isDefaultPool,
      });
      await fetchCoreData();
      return response;
    });

    if (payload) {
      setCategoryForm(initialCategoryForm);
      setDraftForm((current) => ({
        ...current,
        categoryName: current.categoryName || payload.name,
      }));
    }
  }

  function updateCategoryDraft(categoryId, field, value) {
    setCategories((current) =>
      current.map((category) => (category.id === categoryId ? { ...category, [field]: value } : category)),
    );
  }

  async function handleSaveCategory(category) {
    await runAction(`${category.name} 已保存。`, async () => {
      await api.updateCategory(category.id, {
        enabled: category.enabled,
        isDefaultPool: category.isDefaultPool,
      });
      await fetchCoreData();
    });
  }

  function handleExecutorChange(executorId, field, value) {
    setExecutors((current) =>
      current.map((executor) => (executor.id === executorId ? { ...executor, [field]: value } : executor)),
    );
  }

  async function handleSaveExecutor(executor) {
    let argsTemplate = executor.argsTemplate;
    if (typeof executor.argsTemplateText === "string") {
      try {
        argsTemplate = JSON.parse(executor.argsTemplateText);
      } catch {
        setMessage("参数模板必须是合法的 JSON 数组，例如 [\"-p\", \"{promptContent}\"]。");
        setMessageTone("danger");
        return;
      }
    }

    await runAction(`${executor.name} 已保存。`, async () => {
      await api.updateExecutor(executor.id, {
        name: executor.name,
        command: executor.command,
        workingDirectory: executor.workingDirectory,
        timeoutMs: Number(executor.timeoutMs),
        argsTemplate,
        enabled: executor.enabled,
      });
      await fetchCoreData();
    });
  }

  async function handleTestExecutor() {
    const payload = await runAction("执行器测试完成。", async () =>
      api.testExecutor(executorTest.executorId, {
        promptContent: executorTest.promptContent,
      }),
    );

    if (payload) {
      setExecutorTest((current) => ({ ...current, result: payload }));
    }
  }

  function renderGenerate() {
    return (
      <div className="grid grid-cols-1 gap-7 xl:grid-cols-[minmax(360px,472px),minmax(0,1fr)]">
        <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_16px_36px_rgba(15,23,42,0.06)]">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <IconBot />
            </div>
            <div>
              <h3 className="text-[18px] font-semibold tracking-[-0.02em] text-slate-900">生成智能任务</h3>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">分类名称</span>
                  <select
                    value={draftForm.categoryName}
                    onChange={(event) => setDraftForm((current) => ({ ...current, categoryName: event.target.value }))}
                    disabled={enabledCategories.length === 0}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition-all duration-200 hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  >
                    {enabledCategories.length === 0 ? (
                      <option value="">请先在配置中心创建或启用分类</option>
                    ) : null}
                    {enabledCategories.map((category) => (
                      <option key={category.id} value={category.name}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">执行器</span>
                  <select
                    value={draftForm.executorId}
                    onChange={(event) => setDraftForm((current) => ({ ...current, executorId: event.target.value }))}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition-all duration-200 hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  >
                    {executors.map((executor) => (
                      <option key={executor.id} value={executor.id}>
                        {executor.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">任务数量</span>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={draftForm.itemCount}
                  onChange={(event) => setDraftForm((current) => ({ ...current, itemCount: Number(event.target.value) }))}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition-all duration-200 hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">生成目标</span>
                <textarea
                  rows="5"
                  value={draftForm.goal}
                  onChange={(event) => setDraftForm((current) => ({ ...current, goal: event.target.value }))}
                  placeholder="描述希望这次生成的任务主题、边界或计划目标..."
                  className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm leading-6 text-slate-900 outline-none transition-all duration-200 hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </label>
            </div>

            <div className="mt-6">
                <button
                  type="button"
                  onClick={handleGenerateDraft}
                  disabled={loading || enabledCategories.length === 0}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white shadow-[0_14px_30px_rgba(37,99,235,0.22)] transition-all duration-200 hover:scale-[1.01] hover:bg-blue-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? <span className="animate-spin"><IconRefresh /></span> : <IconSend />}
                <span>{loading ? "生成中..." : "生成智能任务"}</span>
              </button>
            </div>
          </section>

          {generatedDraft && generatedItems.length > 0 ? (
            <section className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)] animate-[fadeIn_0.35s_ease]">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900">本次返回列表</h4>
                  <p className="mt-1 text-xs leading-6 text-slate-500">当前生成结果仅在这里预览与调整。</p>
                </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        openLogModal(
                          `草稿日志 / ${generatedDraft.categoryName}`,
                          generatedDraft.goal || "本次草稿生成日志。",
                          buildDraftLogLines(generatedDraft),
                        )
                      }
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 transition-colors hover:border-blue-300 hover:text-blue-600"
                    >
                      查看日志
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleConfirmDraft(generatedDraft.id)}
                      disabled={loading}
                      className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      确认进入任务列表
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {generatedItems.map((row) => (
                    <div
                      key={row.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]"
                    >
                      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <strong className="block text-sm font-semibold text-slate-900">{row.title}</strong>
                          <p className="mt-1 text-sm leading-6 text-slate-500">{row.contentBrief || "暂无摘要"}</p>
                        </div>
                        <StatusPill tone="accent">{row.scheduledDate || "未排期"}</StatusPill>
                      </div>

                      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr),160px,110px]">
                        <input
                          value={row.title}
                          onChange={(event) => updateGeneratedItem(row.id, "title", event.target.value)}
                          className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-all duration-200 hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                        />
                        <input
                          value={row.scheduledDate || ""}
                          type="date"
                          onChange={(event) => updateGeneratedItem(row.id, "scheduledDate", event.target.value)}
                          className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-all duration-200 hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                        />
                        <button
                          type="button"
                          onClick={() => void saveDraftItem(row)}
                          className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-blue-300 hover:text-blue-600"
                        >
                          保存
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : (
              <section className="flex min-h-[400px] flex-col items-center justify-center rounded-[24px] border-2 border-dashed border-slate-200 bg-slate-50/80 px-6 text-center">
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-slate-300 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                  <IconBot />
                </div>
                <h4 className="text-[15px] font-semibold text-slate-500">暂无生成结果</h4>
                <p className="mt-2 max-w-xs text-sm leading-6 text-slate-400">
                  在左侧选择分类与执行器，填写生成目标后，点击「生成智能任务」按钮即可开始。
                </p>
              </section>
            )}
        </div>
      );
    }

    function renderHistoryCategories() {
      const pendingTotal = historyCategoryCards.reduce((sum, item) => sum + item.pendingCount, 0);

      return (
        <div className="page-stack">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-blue-50 px-3 text-xs font-medium text-blue-700">
                共 {historyCategoryCards.length} 个分类
              </span>
              {pendingTotal > 0 && (
                <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-amber-50 px-3 text-xs font-medium text-amber-700">
                  待确认 {pendingTotal}
                </span>
              )}
            </div>
            <ToolbarButton onClick={() => void handleRefresh()} disabled={loading}>刷新数据</ToolbarButton>
          </div>

          {historyCategoryCards.length > 0 ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {historyCategoryCards.map((item) => (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setHistoryCategory(item.id);
                    setScreen("history-batches");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setHistoryCategory(item.id);
                      setScreen("history-batches");
                    }
                  }}
                  className="group cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_4px_20px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_12px_32px_rgba(15,23,42,0.08)]"
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-100">
                        <IconFolder />
                      </div>
                      <div>
                        <h4 className="text-[15px] font-semibold text-slate-900 group-hover:text-blue-700 transition-colors">
                          {item.name}
                        </h4>
                      </div>
                    </div>
                    <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-lg text-slate-300 transition-colors group-hover:bg-blue-50 group-hover:text-blue-500">
                      <IconArrowRight />
                    </span>
                  </div>

                  <div className="mb-4 flex items-center gap-4 text-sm text-slate-500">
                    <span className="font-medium text-slate-700">{item.batchCount} 个批次</span>
                    <span className="text-slate-300">·</span>
                    <span className="font-medium text-slate-700">{item.itemCount} 条任务</span>
                  </div>

                  <p className="mb-4 text-xs text-slate-400">
                    最近更新 {formatDateTime(item.latestDraft?.updatedAt)}
                  </p>

                  <div className="rounded-xl bg-slate-50 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm">
                      <span className={item.pendingCount > 0 ? "text-amber-500" : "text-slate-300"}>●</span>
                      <span className="font-medium text-slate-700">
                        待确认批次 {item.pendingCount} 个
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-[20px] border-2 border-dashed border-slate-200 bg-slate-50/80 px-6 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-slate-300 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                <IconFolder />
              </div>
              <p className="text-sm font-medium text-slate-500">暂无分类数据</p>
              <p className="mt-2 max-w-xs text-sm leading-6 text-slate-400">
                生成任务后，这里会按分类展示对应的统计卡片。
              </p>
            </div>
          )}
        </div>
      );
    }

  function renderHistoryBatches() {
    const categoryName = historyCategory || "未分类";

    return (
      <div className="page-stack">
        <div className="sub-toolbar">
          <div className="breadcrumb-lite">
            <button type="button" onClick={() => setScreen("history-categories")}>智能任务列表</button>
            <span>/</span>
            <strong>{categoryName}</strong>
          </div>
        </div>

        {batchCards.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {batchCards.map((item) => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setCurrentBatchId(item.id);
                  setScreen("history-tasks");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setCurrentBatchId(item.id);
                    setScreen("history-tasks");
                  }
                }}
                className="group cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_4px_20px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_12px_32px_rgba(15,23,42,0.08)]"
              >
                {/* 顶部：日期与星标 */}
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-slate-500">
                    <IconCalendar />
                    {formatFullDate(item.updatedAt)}
                  </div>
                  <span className="text-yellow-400 text-lg leading-none">★</span>
                </div>

                {/* 描述：批次目标，非加粗 */}
                <p className="mb-5 text-sm leading-relaxed text-slate-600 line-clamp-2">
                  {item.goal || item.categoryName}
                </p>

                {/* 中部：草稿数量突出显示 */}
                <div className="mb-4 flex items-center justify-between">
                  <div className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 border border-blue-100 px-3 py-1.5">
                    <span className="text-blue-500"><IconFileText /></span>
                    <span className="text-sm text-blue-800">
                      包含 <span className="font-bold text-base text-blue-600">{item.itemCount || 0}</span> 条草稿任务
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">{item.executorId}</span>
                </div>

                {/* 底部：状态与快捷操作 */}
                <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
                      item.status === "ready"
                        ? "bg-amber-50 text-amber-700 border border-amber-200"
                        : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    }`}
                  >
                    {statusText(item.status)}
                  </span>

                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setCurrentBatchId(item.id);
                        setScreen("batch-detail");
                      }}
                      className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                      title="详情"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openLogModal(
                          `草稿日志 / ${item.categoryName}`,
                          item.goal || "当前草稿批次日志。",
                          buildDraftLogLines(item),
                        );
                      }}
                      className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                      title="日志"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" strokeLinecap="round" strokeLinejoin="round" />
                        <polyline points="14 2 14 8 20 8" strokeLinecap="round" strokeLinejoin="round" />
                        <line x1="16" y1="13" x2="8" y2="13" strokeLinecap="round" strokeLinejoin="round" />
                        <line x1="16" y1="17" x2="8" y2="17" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDeleteDraft(item.id);
                      }}
                      className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                      title="删除"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex min-h-[320px] flex-col items-center justify-center rounded-[20px] border-2 border-dashed border-slate-200 bg-slate-50/80 px-6 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-slate-300 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <IconFileText />
            </div>
            <p className="text-sm font-medium text-slate-500">暂无批次数据</p>
            <p className="mt-2 max-w-xs text-sm leading-6 text-slate-400">
              该分类下还没有生成批次，请先在智能任务生成页面创建。
            </p>
          </div>
        )}
      </div>
    );
  }

  function renderHistoryTasks() {
    const categoryName = currentBatch?.categoryName || historyCategory || "未分类";
    const isConfirmedBatch = currentBatch && currentBatch.status === "confirmed";
    const selectedCount = selectedItems.size;

    function toggleSelect(itemId) {
      setSelectedItems((prev) => {
        const next = new Set(prev);
        if (next.has(itemId)) {
          next.delete(itemId);
        } else {
          next.add(itemId);
        }
        return next;
      });
    }

    function toggleSelectAll() {
      const allDraft = currentBatchItems.filter((it) => it.status !== "confirmed");
      if (allDraft.length === 0) return;
      if (allDraft.every((it) => selectedItems.has(it.id))) {
        setSelectedItems(new Set());
      } else {
        setSelectedItems(new Set(allDraft.map((it) => it.id)));
      }
    }

    async function handleBatchPush() {
      if (selectedItems.size === 0) return;
      const itemIds = Array.from(selectedItems);
      showConfirm(
        "批量加入任务",
        `确认将选中的 ${itemIds.length} 条任务加入任务列表吗？`,
        async () => {
          await runAction(`${itemIds.length} 条任务已加入任务列表。`, async () => {
            await api.confirmDraftItems(currentBatch.id, itemIds);
            setSelectedItems(new Set());
            await fetchCoreData();
            const items = await api.getDraftItems(currentBatchId);
            setCurrentBatchItems(items);
            setConfirmModal({ visible: false, title: "", message: "", onConfirm: null });
          });
        },
      );
    }

    const allDraftItems = currentBatchItems.filter((it) => it.status !== "confirmed");
    const allSelected = allDraftItems.length > 0 && allDraftItems.every((it) => selectedItems.has(it.id));

    return (
      <div className="page-stack">
        <div className="sub-toolbar">
          <div className="breadcrumb-lite">
            <button type="button" onClick={() => setScreen("history-categories")}>分类</button>
            <span>/</span>
            <button type="button" onClick={() => setScreen("history-batches")}>批次</button>
            <span>/</span>
            <strong>任务列表</strong>
          </div>
          <div className="panel-actions">
            {!isConfirmedBatch && allDraftItems.length > 0 && (
              <>
                <ToolbarButton onClick={toggleSelectAll}>
                  {allSelected ? "取消全选" : "全选"}
                </ToolbarButton>
                {selectedCount > 0 && (
                  <ToolbarButton primary onClick={() => void handleBatchPush()} disabled={loading}>
                    批量加入 ({selectedCount})
                  </ToolbarButton>
                )}
              </>
            )}
            {!isConfirmedBatch && (
              <ToolbarButton primary onClick={() => void handleConfirmDraft(currentBatch.id)} disabled={loading}>
                全部确认加入任务
              </ToolbarButton>
            )}
          </div>
        </div>

        {currentBatchItems.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {currentBatchItems.map((item) => {
              const isPushed = item.status === "confirmed" || isConfirmedBatch;
              const isSelected = selectedItems.has(item.id);

              return (
                <div
                  key={item.id}
                  className={`group rounded-2xl border bg-white p-5 shadow-[0_4px_20px_rgba(15,23,42,0.04)] transition-all duration-200 hover:border-blue-200 hover:shadow-[0_8px_28px_rgba(15,23,42,0.07)] ${
                    isPushed ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200"
                  } ${isSelected ? "border-blue-400 ring-2 ring-blue-500/20" : ""}`}
                >
                  {/* 头部：标题 + 复选框 */}
                  <div className="mb-3 flex items-start gap-3">
                    {!isPushed && (
                      <label className="mt-0.5 flex-shrink-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(item.id)}
                          className="h-4 w-4 cursor-pointer rounded border-slate-300 text-blue-600 accent-blue-600"
                        />
                      </label>
                    )}
                    <h4 className="flex-1 text-[15px] font-semibold leading-snug text-slate-900">
                      {item.title}
                      {isPushed && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          已加入
                        </span>
                      )}
                    </h4>
                  </div>

                  {/* 描述 */}
                  <p className="mb-4 text-sm leading-relaxed text-slate-500 line-clamp-3">
                    {item.contentBrief || "暂无描述"}
                  </p>

                  {/* 执行时间 */}
                  <div className="mb-4 inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-1.5 text-sm text-slate-600">
                    <IconClock />
                    <span>{formatFullDate(item.scheduledDate)}</span>
                  </div>

                  {/* 底部操作栏 */}
                  <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                    <span className="text-xs text-slate-400">
                      序号 {item.orderNo} · {categoryName}
                    </span>
                    <div className="flex gap-1">
                      {!isPushed && (
                        <button
                          type="button"
                          onClick={() => void handlePushDraftItem(item)}
                          disabled={loading}
                          className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                          title="加入任务列表"
                        >
                          <IconPlusCircle />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setEditItem({ ...item })}
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                        title="编辑"
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteDraftItem(item.id)}
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                        title="删除"
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-[320px] flex-col items-center justify-center rounded-[20px] border-2 border-dashed border-slate-200 bg-slate-50/80 px-6 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-slate-300 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <IconFileText />
            </div>
            <p className="text-sm font-medium text-slate-500">暂无任务项</p>
            <p className="mt-2 max-w-xs text-sm leading-6 text-slate-400">
              该批次中还没有生成任务项。
            </p>
          </div>
        )}

        {/* 编辑弹窗 */}
        <Modal
          visible={editItem !== null}
          title="编辑任务项"
          subtitle="修改标题、描述和排期日期。"
          onClose={() => setEditItem(null)}
        >
          {editItem && (
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">任务标题</span>
                <input
                  value={editItem.title}
                  onChange={(event) => setEditItem((current) => ({ ...current, title: event.target.value }))}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-all duration-200 hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">任务描述</span>
                <textarea
                  rows="4"
                  value={editItem.contentBrief}
                  onChange={(event) => setEditItem((current) => ({ ...current, contentBrief: event.target.value }))}
                  className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm leading-6 text-slate-900 outline-none transition-all duration-200 hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">执行日期</span>
                <input
                  type="date"
                  value={editItem.scheduledDate || ""}
                  onChange={(event) => setEditItem((current) => ({ ...current, scheduledDate: event.target.value }))}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-all duration-200 hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </label>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditItem(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await saveDraftItem(editItem);
                    setEditItem(null);
                  }}
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                >
                  保存
                </button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    );
  }

  function renderBatchDetail() {
    if (!currentBatch) {
      return <div className="empty-inline">当前没有可查看的批次。</div>;
    }

    return (
      <div className="page-stack">
        <div className="sub-toolbar">
          <div className="breadcrumb-lite">
            <button type="button" onClick={() => setScreen("history-categories")}>分类</button>
            <span>/</span>
            <button type="button" onClick={() => setScreen("history-batches")}>批次</button>
            <span>/</span>
            <strong>详情</strong>
          </div>
          <div className="panel-actions">
            <ToolbarButton
              onClick={() => openLogModal(
                `草稿日志 / ${currentBatch.categoryName}`,
                currentBatch.goal || "当前草稿批次日志。",
                buildDraftLogLines(currentBatch),
              )}
            >
              查看日志
            </ToolbarButton>
            <ToolbarButton primary onClick={() => setScreen("batch-edit")}>进入编辑页</ToolbarButton>
          </div>
        </div>

        <section className="surface-panel">
          <div className="kv-grid">
            <div className="kv-item"><span>批次目标</span><strong>{currentBatch.goal || currentBatch.categoryName}</strong></div>
            <div className="kv-item"><span>分类</span><strong>{currentBatch.categoryName}</strong></div>
            <div className="kv-item"><span>执行器</span><strong>{currentBatch.executorId}</strong></div>
            <div className="kv-item"><span>任务数量</span><strong>{currentBatch.itemCount || 0} 条</strong></div>
            <div className="kv-item"><span>状态</span><strong>{statusText(currentBatch.status)}</strong></div>
            <div className="kv-item"><span>最近更新</span><strong>{formatDateTime(currentBatch.updatedAt)}</strong></div>
          </div>
        </section>
      </div>
    );
  }

  function renderBatchEdit() {
    if (!currentBatch) {
      return <div className="empty-inline">当前没有可编辑的批次。</div>;
    }

    return (
      <div className="page-stack">
        <div className="sub-toolbar">
          <div className="breadcrumb-lite">
            <button type="button" onClick={() => setScreen("history-categories")}>分类</button>
            <span>/</span>
            <button type="button" onClick={() => setScreen("history-batches")}>批次</button>
            <span>/</span>
            <strong>编辑</strong>
          </div>
          <div className="panel-actions">
            <ToolbarButton
              onClick={() => openLogModal(
                `草稿日志 / ${currentBatch.categoryName}`,
                currentBatch.goal || "当前草稿批次日志。",
                buildDraftLogLines(currentBatch),
              )}
            >
              查看日志
            </ToolbarButton>
            {currentBatch.status === "ready" ? (
              <ToolbarButton primary onClick={() => void handleConfirmDraft(currentBatch.id)} disabled={loading}>
                确认草稿
              </ToolbarButton>
            ) : null}
          </div>
        </div>

        <section className="surface-panel">
          <div className="edit-list">
            {currentBatchItems.map((item) => (
              <div key={item.id} className="edit-item editable">
                <div className="edit-form-fill">
                  <input
                    value={item.title}
                    onChange={(event) =>
                      setCurrentBatchItems((current) =>
                        current.map((row) => (row.id === item.id ? { ...row, title: event.target.value } : row)),
                      )
                    }
                  />
                  <textarea
                    rows="3"
                    value={item.contentBrief}
                    onChange={(event) =>
                      setCurrentBatchItems((current) =>
                        current.map((row) => (row.id === item.id ? { ...row, contentBrief: event.target.value } : row)),
                      )
                    }
                  />
                  <div className="inline-edit-grid">
                    <input
                      type="number"
                      value={item.orderNo}
                      onChange={(event) =>
                        setCurrentBatchItems((current) =>
                          current.map((row) => (row.id === item.id ? { ...row, orderNo: Number(event.target.value) } : row)),
                        )
                      }
                    />
                    <input
                      type="date"
                      value={item.scheduledDate || ""}
                      onChange={(event) =>
                        setCurrentBatchItems((current) =>
                          current.map((row) => (row.id === item.id ? { ...row, scheduledDate: event.target.value } : row)),
                        )
                      }
                    />
                    <ToolbarButton onClick={() => void saveDraftItem(item)}>保存</ToolbarButton>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  function renderQueueCategories() {
    const pendingTotal = queueCategoryCards.reduce((sum, item) => sum + item.pendingCount, 0);

    return (
      <div className="page-stack">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-blue-50 px-3 text-xs font-medium text-blue-700">
              共 {queueCategoryCards.length} 个分类
            </span>
            {pendingTotal > 0 && (
              <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-amber-50 px-3 text-xs font-medium text-amber-700">
                待执行 {pendingTotal}
              </span>
            )}
          </div>
          <ToolbarButton onClick={() => void handleRefresh()} disabled={loading}>刷新数据</ToolbarButton>
        </div>

        {queueCategoryCards.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {queueCategoryCards.map((item) => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setQueueCategory(item.id);
                  setScreen("queue-tasks");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setQueueCategory(item.id);
                    setScreen("queue-tasks");
                  }
                }}
                className="group cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_4px_20px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_12px_32px_rgba(15,23,42,0.08)]"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-100">
                      <IconFolder />
                    </div>
                    <div>
                      <h4 className="text-[15px] font-semibold text-slate-900 group-hover:text-blue-700 transition-colors">
                        {item.name}
                      </h4>
                    </div>
                  </div>
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-lg text-slate-300 transition-colors group-hover:bg-blue-50 group-hover:text-blue-500">
                    <IconArrowRight />
                  </span>
                </div>

                <div className="mb-4 flex items-center gap-4 text-sm text-slate-500">
                  <span className="font-medium text-slate-700">{item.pendingCount} 条待执行</span>
                  <span className="text-slate-300">·</span>
                  <span className="font-medium text-slate-700">{item.completedCount} 条已执行</span>
                </div>

                <p className="mb-4 text-xs text-slate-400">
                  正式任务已按状态归档，可从这里进入分类任务列表。
                </p>

                <div className="rounded-xl bg-slate-50 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span className={item.pendingCount > 0 ? "text-amber-500" : "text-slate-300"}>●</span>
                    <span className="font-medium text-slate-700">
                      系统默认任务 {item.defaultCount} 条
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex min-h-[320px] flex-col items-center justify-center rounded-[20px] border-2 border-dashed border-slate-200 bg-slate-50/80 px-6 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-slate-300 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <IconFolder />
            </div>
            <p className="text-sm font-medium text-slate-500">暂无任务分类</p>
            <p className="mt-2 max-w-xs text-sm leading-6 text-slate-400">
              确认草稿批次后，正式任务会按分类展示在这里。
            </p>
          </div>
        )}
      </div>
    );
  }

  function renderQueueTasks() {
    const pendingTotal = queueTasks.filter((t) => t.status === "pending" || t.status === "running").length;

    return (
      <div className="page-stack">
        <div className="sub-toolbar">
          <div className="breadcrumb-lite">
            <button type="button" onClick={() => setScreen("queue-categories")}>任务分类</button>
            <span>/</span>
            <strong>{queueCategory || "未分类"}</strong>
          </div>
          <div className="panel-actions">
            <div className="tab-cluster">
              {taskStatusTabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={queueStatus === item.id ? "active" : ""}
                  onClick={() => setQueueStatus(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
              <ToolbarButton
                onClick={() => void handleCreateDefaultTask()}
                disabled={!defaultPlan.enabled || (!defaultTask && defaultPoolCategories.length === 0)}
              >
                {defaultTask ? "查看系统默认任务" : "同步系统默认任务"}
              </ToolbarButton>
            </div>
          </div>

        {queueTasks.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {queueTasks.map((item) => (
              <div
                key={item.id}
                className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_4px_20px_rgba(15,23,42,0.04)] transition-all duration-200 hover:border-blue-200 hover:shadow-[0_8px_28px_rgba(15,23,42,0.07)]"
              >
                {/* 头部：标题 */}
                <div className="mb-3">
                  <h4 className="text-[15px] font-semibold leading-snug text-slate-900">
                    {item.title}
                  </h4>
                </div>

                {/* 元信息 */}
                <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                  <div className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1 text-xs">
                    <IconClock />
                    <span>{formatFullDate(item.scheduledDate)}</span>
                  </div>
                  <span className="text-xs text-slate-400">{taskTypeText(item.taskType)}</span>
                </div>

                {/* 来源/描述 */}
                <p className="mb-4 text-sm leading-relaxed text-slate-500 line-clamp-2">
                  {item.items?.[0]?.contentBrief || item.items?.[0]?.title || "暂无描述"}
                </p>

                {/* 底部操作栏 */}
                <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                  <StatusPill tone={statusTone(item.status)}>{statusText(item.status)}</StatusPill>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentTaskId(item.id);
                        setScreen("task-detail");
                      }}
                      className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                      title="详情"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
                    {item.status === "pending" && (
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentTaskId(item.id);
                          setScreen("task-edit");
                        }}
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                        title="编辑"
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    )}
                    {item.status === "failed" && (
                      <button
                        type="button"
                        onClick={() => void handleRunTask(item.id)}
                        disabled={loading}
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                        title="重新执行"
                      >
                        <IconRefresh />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openLogModal(
                        `任务日志 / ${item.title}`,
                        "这里展示任务最近一次运行日志。",
                        buildRunLogLines(runs.find((run) => run.taskId === item.id) || null),
                      )}
                      className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                      title="日志"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" strokeLinecap="round" strokeLinejoin="round" />
                        <polyline points="14 2 14 8 20 8" strokeLinecap="round" strokeLinejoin="round" />
                        <line x1="16" y1="13" x2="8" y2="13" strokeLinecap="round" strokeLinejoin="round" />
                        <line x1="16" y1="17" x2="8" y2="17" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteTask(item.id)}
                      className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                      title="删除"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex min-h-[320px] flex-col items-center justify-center rounded-[20px] border-2 border-dashed border-slate-200 bg-slate-50/80 px-6 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-slate-300 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <IconFileText />
            </div>
            <p className="text-sm font-medium text-slate-500">暂无任务</p>
            <p className="mt-2 max-w-xs text-sm leading-6 text-slate-400">
              {queueStatus === "pending" ? "暂无待执行任务。" : "暂无已完成任务。"}
            </p>
          </div>
        )}
      </div>
    );
  }

  function renderTaskDetail() {
    if (!currentTask) {
      return <div className="empty-inline">当前没有可查看的任务。</div>;
    }

    return (
      <div className="page-stack">
        <div className="sub-toolbar">
          <div className="breadcrumb-lite">
            <button type="button" onClick={() => setScreen("queue-categories")}>任务分类</button>
            <span>/</span>
            <button type="button" onClick={() => setScreen("queue-tasks")}>任务列表</button>
            <span>/</span>
            <strong>详情</strong>
          </div>
          <div className="panel-actions">
            <ToolbarButton
              onClick={() => openLogModal(
                `任务日志 / ${currentTask.title}`,
                "这里展示当前任务最近一次运行日志。",
                buildRunLogLines(latestTaskRun),
              )}
            >
              查看日志
            </ToolbarButton>
            {currentTask.status === "pending" || currentTask.status === "failed" ? (
              <ToolbarButton primary onClick={() => void handleRunTask(currentTask.id)} disabled={loading}>
                {currentTask.status === "failed" ? "重新执行" : "立即执行"}
              </ToolbarButton>
            ) : null}
            {currentTask.status === "pending" ? (
              <ToolbarButton primary onClick={() => setScreen("task-edit")}>进入编辑页</ToolbarButton>
            ) : null}
          </div>
        </div>

        <div className="split-layout">
          <section className="surface-panel">
            <div className="kv-grid">
              <div className="kv-item"><span>任务标题</span><strong>{currentTask.title}</strong></div>
              <div className="kv-item"><span>分类</span><strong>{currentTask.categoryName}</strong></div>
              <div className="kv-item"><span>执行日期</span><strong>{formatDate(currentTask.scheduledDate)}</strong></div>
              <div className="kv-item"><span>任务来源</span><strong>{taskTypeText(currentTask.taskType)}</strong></div>
              <div className="kv-item"><span>状态</span><strong>{statusText(currentTask.status)}</strong></div>
              <div className="kv-item"><span>执行器</span><strong>{currentTask.executorId || "未指定"}</strong></div>
            </div>

            {currentTask.articlePath || currentTask.publishResult ? (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                <h4 className="mb-3 text-sm font-semibold text-emerald-800">发布结果</h4>
                <div className="space-y-2 text-sm text-slate-700">
                  {currentTask.articleTitle ? (
                    <p><span className="text-slate-500">文章标题：</span>{currentTask.articleTitle}</p>
                  ) : null}
                  {currentTask.articlePath ? (
                    <p className="break-all"><span className="text-slate-500">文章路径：</span>{currentTask.articlePath}</p>
                  ) : null}
                  {currentTask.publishResult ? (
                    <>
                      <p>
                        <span className="text-slate-500">Git 提交：</span>
                        {currentTask.publishResult.committed ? "已提交" : "未提交"}
                        <span className="mx-2 text-slate-300">·</span>
                        <span className="text-slate-500">推送：</span>
                        {currentTask.publishResult.pushed ? `已推送到 ${currentTask.publishResult.branch}` : "未推送"}
                      </p>
                      {Array.isArray(currentTask.publishResult.files) && currentTask.publishResult.files.length > 1 ? (
                        <p className="break-all">
                          <span className="text-slate-500">提交文件：</span>
                          {currentTask.publishResult.files.join("、")}
                        </p>
                      ) : null}
                      {Array.isArray(currentTask.publishResult.fixedFrontMatterFields) &&
                      currentTask.publishResult.fixedFrontMatterFields.length > 0 ? (
                        <p>
                          <span className="text-slate-500">已自动补齐 front-matter 字段：</span>
                          {currentTask.publishResult.fixedFrontMatterFields.join("、")}
                        </p>
                      ) : null}
                      {currentTask.publishResult.error ? (
                        <p className="text-red-600">发布出错：{currentTask.publishResult.error}</p>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>

          <section className="surface-panel">
            <div className="panel-head">
              <div>
                <h3>知识点与结果</h3>
                <p>{latestTaskRun ? `最近运行：${formatDateTime(latestTaskRun.startedAt)}` : "暂无运行记录"}</p>
              </div>
            </div>
            <ul className="point-list">
              {currentTask.items.map((point) => (
                <li key={point.id}>{point.title}{point.contentBrief ? `：${point.contentBrief}` : ""}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    );
  }

  function renderTaskEdit() {
    if (!taskEditor) {
      return <div className="empty-inline">当前没有可编辑的任务。</div>;
    }

    return (
      <div className="page-stack">
        <div className="sub-toolbar">
          <div className="breadcrumb-lite">
            <button type="button" onClick={() => setScreen("queue-categories")}>任务分类</button>
            <span>/</span>
            <button type="button" onClick={() => setScreen("queue-tasks")}>任务列表</button>
            <span>/</span>
            <strong>编辑</strong>
          </div>
          <div className="panel-actions">
            <ToolbarButton onClick={() => void handleSaveTask()} disabled={loading}>保存修改</ToolbarButton>
            {taskEditor.status === "pending" ? (
              <ToolbarButton primary onClick={() => void handleRunTask(taskEditor.id)} disabled={loading}>立即执行</ToolbarButton>
            ) : null}
          </div>
        </div>

        <section className="surface-panel">
          {taskEditor.status !== "pending" ? (
            <div className="empty-inline">只有待执行任务可以编辑。</div>
          ) : (
            <div className="edit-list">
              <div className="edit-item editable">
                <div className="edit-form-fill">
                  <input
                    value={taskEditor.title}
                    onChange={(event) => setTaskEditor((current) => (current ? { ...current, title: event.target.value } : current))}
                  />
                  <div className="inline-edit-grid">
                    <input
                      type="date"
                      value={taskEditor.scheduledDate || ""}
                      onChange={(event) =>
                        setTaskEditor((current) => (current ? { ...current, scheduledDate: event.target.value } : current))
                      }
                    />
                  </div>
                </div>
              </div>

              {taskEditor.items.map((item) => (
                <div key={item.id} className="edit-item editable">
                  <div className="edit-form-fill">
                    <input value={item.title} onChange={(event) => updateTaskEditorItem(item.id, "title", event.target.value)} />
                    <textarea rows="3" value={item.contentBrief} onChange={(event) => updateTaskEditorItem(item.id, "contentBrief", event.target.value)} />
                    <div className="inline-edit-grid">
                      <input
                        type="number"
                        value={item.orderNo}
                        onChange={(event) => updateTaskEditorItem(item.id, "orderNo", Number(event.target.value))}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  function renderSettings() {
    return (
      <div className="page-stack">
        <div className="split-layout">
          <div className="grid gap-4">
            <section className="surface-panel">
              <div className="panel-head">
                <div>
                  <h3>仓库与默认任务</h3>
                  <p>维护博客仓库、扫描来源、默认执行器，以及系统内置默认任务的启停状态。</p>
                </div>
                <div className="panel-actions">
                  <StatusPill tone={defaultPlan.enabled ? "success" : "default"}>
                    {defaultPlan.enabled ? "默认任务已启用" : "默认任务已关闭"}
                  </StatusPill>
                  <StatusPill tone={defaultTask ? "accent" : "default"}>
                    {defaultTask ? `内置任务 / ${defaultTask.categoryName}` : "内置任务未创建"}
                  </StatusPill>
                </div>
              </div>

              <div className="form-blocks">
                <label className="field-block">
                  <span>仓库路径</span>
                  <input value={repository.path} onChange={(event) => setRepository((current) => ({ ...current, path: event.target.value }))} />
                </label>
                <label className="field-block">
                  <span>目标分支</span>
                  <input value={repository.branch} onChange={(event) => setRepository((current) => ({ ...current, branch: event.target.value }))} />
                </label>
                <label className="field-block">
                  <span>文档目录</span>
                  <input value={repository.docsDir} onChange={(event) => setRepository((current) => ({ ...current, docsDir: event.target.value }))} />
                </label>
                <label className="field-block">
                  <span>默认执行器</span>
                  <select
                    value={defaultPlan.defaultExecutorId}
                    onChange={(event) => setDefaultPlan((current) => ({ ...current, defaultExecutorId: event.target.value }))}
                  >
                    {executors.map((executor) => (
                      <option key={executor.id} value={executor.id}>
                        {executor.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="field-block">
                  <span>内置默认任务</span>
                  <label className="inline-flex items-center gap-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={defaultPlan.enabled}
                      onChange={(event) => setDefaultPlan((current) => ({ ...current, enabled: event.target.checked }))}
                    />
                    启用系统内置默认任务
                  </label>
                  <p>关闭后会移除唯一的系统默认任务；开启后会按默认分类池自动保留 1 条。</p>
                </div>
                <div className="field-block">
                  <span>自动推送 Git</span>
                  <label className="inline-flex items-center gap-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={repository.autoPush}
                      onChange={(event) => setRepository((current) => ({ ...current, autoPush: event.target.checked }))}
                    />
                    执行成功后自动 push 到远端
                  </label>
                  <p>当前默认分类池 {defaultPoolCategories.length} 个分类，可用于系统默认任务随机选类。</p>
                </div>
                <div className="field-block">
                  <span>定时自动执行</span>
                  <label className="inline-flex items-center gap-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={defaultPlan.autoScheduleEnabled}
                      onChange={(event) =>
                        setDefaultPlan((current) => ({ ...current, autoScheduleEnabled: event.target.checked }))
                      }
                    />
                    到期任务自动执行
                  </label>
                  <p>开启后，服务端每分钟检查一次执行日期已到的待执行任务，用默认执行器自动写作并发布。</p>
                </div>
              </div>

              <div className="panel-actions">
                <ToolbarButton onClick={() => void handleScanRepository()} disabled={loading}>扫描仓库分类</ToolbarButton>
                <ToolbarButton onClick={() => void handleSaveRepository()} disabled={loading}>保存仓库配置</ToolbarButton>
                <ToolbarButton primary onClick={() => void handleSaveDefaultPlan()} disabled={loading}>保存默认任务配置</ToolbarButton>
                <ToolbarButton
                  onClick={() => void handleCreateDefaultTask()}
                  disabled={!defaultPlan.enabled || (!defaultTask && defaultPoolCategories.length === 0)}
                >
                  {defaultTask ? "同步并定位默认任务" : "立即创建默认任务"}
                </ToolbarButton>
              </div>
            </section>

            <section className="surface-panel">
              <div className="panel-head">
                <div>
                  <h3>分类管理</h3>
                  <p>支持新增自定义分类，并维护哪些分类允许生成任务、哪些进入默认任务池。</p>
                </div>
                <StatusPill tone="accent">{categories.length} 个分类</StatusPill>
              </div>

              <div className="form-blocks">
                <label className="field-block wide">
                  <span>新增自定义分类</span>
                  <input
                    value={categoryForm.name}
                    placeholder="例如：React 性能优化"
                    onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))}
                  />
                </label>
                <div className="field-block">
                  <span>创建后状态</span>
                  <label className="inline-flex items-center gap-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={categoryForm.enabled}
                      onChange={(event) => setCategoryForm((current) => ({ ...current, enabled: event.target.checked }))}
                    />
                    立即启用
                  </label>
                </div>
                <div className="field-block">
                  <span>默认任务池</span>
                  <label className="inline-flex items-center gap-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={categoryForm.isDefaultPool}
                      onChange={(event) => setCategoryForm((current) => ({ ...current, isDefaultPool: event.target.checked }))}
                    />
                    加入默认任务池
                  </label>
                </div>
              </div>
              <div className="panel-actions">
                <ToolbarButton primary onClick={() => void handleCreateCategory()} disabled={loading}>新增分类</ToolbarButton>
              </div>

              <div className="mini-list">
                {categories.length > 0 ? categories.map((category) => (
                  <div key={category.id} className="mini-list-row editable">
                    <div className="list-fill">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong>{category.name}</strong>
                        <StatusPill tone={category.enabled ? "success" : "default"}>
                          {category.enabled ? "已启用" : "已停用"}
                        </StatusPill>
                        {category.isDefaultPool ? <StatusPill tone="accent">默认池</StatusPill> : null}
                      </div>
                      <p>
                        {categorySourceText(category.source)} · 已索引 {category.articleCount || 0} 篇文章
                        {category.displayName && category.displayName !== category.name
                          ? ` · 文章分类名：${category.displayName}`
                          : ""}
                      </p>
                      <div className="inline-edit-grid">
                        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={category.enabled}
                            onChange={(event) => updateCategoryDraft(category.id, "enabled", event.target.checked)}
                          />
                          允许用于生成任务
                        </label>
                        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={category.isDefaultPool}
                            onChange={(event) => updateCategoryDraft(category.id, "isDefaultPool", event.target.checked)}
                          />
                          加入默认任务池
                        </label>
                        <ToolbarButton onClick={() => void handleSaveCategory(category)} disabled={loading}>保存</ToolbarButton>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="empty-inline">还没有分类。先扫描仓库，或者手动新增一个自定义分类。</div>
                )}
              </div>
            </section>
          </div>

          <section className="surface-panel">
            <div className="panel-head">
              <div>
                <h3>执行器列表</h3>
                <p>统一测试和维护，不和任务页混排。</p>
              </div>
            </div>
            <div className="mini-list">
              {executors.map((executor) => (
                <div key={executor.id} className="mini-list-row">
                  <div className="list-fill">
                    <strong>{executor.name}</strong>
                    <p>{executor.id} · {executor.type}</p>
                    <div className="grid gap-2">
                      <label className="block">
                        <span className="mb-1 block text-xs text-slate-500">名称</span>
                        <input
                          className="w-full"
                          value={executor.name}
                          onChange={(event) => handleExecutorChange(executor.id, "name", event.target.value)}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs text-slate-500">命令</span>
                        <input
                          className="w-full"
                          value={executor.command}
                          onChange={(event) => handleExecutorChange(executor.id, "command", event.target.value)}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs text-slate-500">参数模板（JSON 数组，{"{promptContent}"} 会被替换为 Prompt）</span>
                        <input
                          className="w-full font-mono text-xs"
                          value={executor.argsTemplateText ?? JSON.stringify(executor.argsTemplate)}
                          onChange={(event) => handleExecutorChange(executor.id, "argsTemplateText", event.target.value)}
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                          <span className="mb-1 block text-xs text-slate-500">工作目录</span>
                          <input
                            className="w-full"
                            value={executor.workingDirectory}
                            onChange={(event) => handleExecutorChange(executor.id, "workingDirectory", event.target.value)}
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs text-slate-500">超时（毫秒）</span>
                          <input
                            className="w-full"
                            type="number"
                            min="1000"
                            step="1000"
                            value={executor.timeoutMs}
                            onChange={(event) => handleExecutorChange(executor.id, "timeoutMs", Number(event.target.value))}
                          />
                        </label>
                      </div>
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={executor.enabled}
                          onChange={(event) => handleExecutorChange(executor.id, "enabled", event.target.checked)}
                        />
                        启用
                      </label>
                    </div>
                  </div>
                  <div className="mini-list-actions">
                    <StatusPill tone={executor.enabled ? "success" : "default"}>{executor.enabled ? "启用中" : "已停用"}</StatusPill>
                    <ToolbarButton onClick={() => void handleSaveExecutor(executor)} disabled={loading}>保存</ToolbarButton>
                  </div>
                </div>
              ))}
            </div>

            <div className="surface-panel nested-panel">
              <div className="panel-head">
                <div>
                  <h3>执行器测试</h3>
                  <p>测试结果会直接显示在当前界面。</p>
                </div>
              </div>
              <div className="form-blocks">
                <label className="field-block">
                  <span>测试执行器</span>
                  <select
                    value={executorTest.executorId}
                    onChange={(event) => setExecutorTest((current) => ({ ...current, executorId: event.target.value }))}
                  >
                    {executors.map((executor) => (
                      <option key={executor.id} value={executor.id}>
                        {executor.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-block wide">
                  <span>测试 Prompt</span>
                  <textarea
                    rows="4"
                    value={executorTest.promptContent}
                    onChange={(event) => setExecutorTest((current) => ({ ...current, promptContent: event.target.value }))}
                  />
                </label>
              </div>
              <div className="panel-actions">
                <ToolbarButton primary onClick={() => void handleTestExecutor()} disabled={loading}>发送测试</ToolbarButton>
              </div>
              {executorTest.result ? (
                <div className="log-lines">
                  {buildRunLogLines({
                    promptText: executorTest.result.promptText,
                    stdoutText: executorTest.result.stdoutText,
                    stderrText: executorTest.result.stderrText,
                  }).map((line) => (
                    <div key={line} className="log-line">{line}</div>
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    );
  }

  function renderContent() {
    switch (screen) {
      case "generate":
        return renderGenerate();
      case "history-categories":
        return renderHistoryCategories();
      case "history-batches":
        return renderHistoryBatches();
      case "history-tasks":
        return renderHistoryTasks();
      case "batch-detail":
        return renderBatchDetail();
      case "batch-edit":
        return renderBatchEdit();
      case "queue-categories":
        return renderQueueCategories();
      case "queue-tasks":
        return renderQueueTasks();
      case "task-detail":
        return renderTaskDetail();
      case "task-edit":
        return renderTaskEdit();
      case "settings":
        return renderSettings();
      default:
        return null;
    }
  }

  return (
    <>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            <LogoMark />
            <div>
              <h1>TaskShelf</h1>
              <p>Admin Console</p>
            </div>
          </div>
          <nav className="nav">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`nav-item ${rootKeyForScreen(screen) === item.id ? "active" : ""}`}
                onClick={() => setScreen(item.id)}
              >
                <NavIcon id={item.id} />
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.note}</span>
                </div>
              </button>
            ))}
          </nav>
        </aside>

        <main className="workspace">
          {message ? <div className={`message-banner message-banner-${messageTone}`}>{message}</div> : null}
          <div className="workspace-actions">
            <ToolbarButton onClick={() => void handleRefresh()} disabled={loading}>刷新数据</ToolbarButton>
          </div>
          {renderContent()}
        </main>
      </div>

      <Modal
        visible={logModal.visible}
        title={logModal.title}
        subtitle={logModal.subtitle}
        onClose={() => setLogModal({ visible: false, title: "", subtitle: "", lines: [] })}
      >
        <div className="log-lines">
          {logModal.lines.map((line) => (
            <div key={line} className="log-line">{line}</div>
          ))}
        </div>
      </Modal>

      <ConfirmModal
        visible={confirmModal.visible}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={() => confirmModal.onConfirm?.()}
        onCancel={() => setConfirmModal({ visible: false, title: "", message: "", onConfirm: null })}
      />
    </>
  );
}

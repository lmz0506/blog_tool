import { useEffect, useMemo, useState } from "react";

import { api } from "./api.js";

const NAV_ITEMS = [
  { id: "generate", label: "智能任务生成", note: "拟定写作计划" },
  { id: "history-categories", label: "智能任务列表", note: "分类 / 批次 / 任务" },
  { id: "queue-categories", label: "任务列表", note: "全部任务 · 筛选排序" },
  { id: "settings", label: "配置中心", note: "仓库 · 自动化 · 执行器" },
];

const PAGE_META = {
  generate: {
    title: "智能任务生成",
    subtitle: "选定分类与执行器，由 Agent 为该分类拟定一批文章写作计划。",
  },
  "history-categories": {
    title: "智能任务列表",
    subtitle: "按分类查看历史生成的草稿批次，逐层进入批次与任务项。",
  },
  "history-batches": {
    title: "分类批次",
    subtitle: "当前分类下的所有草稿批次，详情、编辑与日志从卡片进入。",
  },
  "history-tasks": {
    title: "批次任务列表",
    subtitle: "勾选任务项批量加入任务列表，或逐条编辑后单独加入。",
  },
  "batch-detail": {
    title: "批次详情",
    subtitle: "查看当前批次的摘要信息与生成日志。",
  },
  "batch-edit": {
    title: "编辑批次",
    subtitle: "调整任务项的标题、摘要、顺序与排期，完成后确认进入任务列表。",
  },
  "queue-categories": {
    title: "任务列表",
    subtitle: "全部正式任务按「执行中 → 待执行 → 已失败 → 已完成」和执行时间排序，可按分类与状态筛选。",
  },
  "task-detail": {
    title: "任务详情",
    subtitle: "查看任务的来源、排期、执行状态与文章发布结果。",
  },
  "task-edit": {
    title: "编辑任务",
    subtitle: "修改标题、执行日期与知识点，或立即执行当前任务。",
  },
  settings: {
    title: "配置中心",
    subtitle: "仓库与发布、自动化策略、分类与执行器，按标签页分区管理。",
  },
};

const SETTINGS_TABS = [
  { id: "repository", label: "仓库与发布" },
  { id: "categories", label: "分类管理" },
  { id: "executors", label: "执行器" },
  { id: "automation", label: "自动化" },
];

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
  isDefaultPool: true,
};

const taskFilterTabs = [
  { id: "all", label: "全部" },
  { id: "queued", label: "已入队" },
  { id: "pending", label: "待执行" },
  { id: "running", label: "执行中" },
  { id: "done", label: "已完成" },
  { id: "failed", label: "已失败" },
];

const TASK_PAGE_SIZE = 9;

const TASK_STATUS_ORDER = { running: 0, queued: 1, pending: 2, failed: 3, done: 4 };

function rootKeyForScreen(screen) {
  if (screen.startsWith("history")) return "history-categories";
  if (screen.startsWith("batch")) return "history-categories";
  if (screen.startsWith("queue")) return "queue-categories";
  if (screen.startsWith("task")) return "queue-categories";
  return screen;
}

function statusTone(status) {
  if (status === "running" || status === "ready" || status === "pending" || status === "queued") return "accent";
  if (status === "done" || status === "success" || status === "confirmed") return "success";
  if (status === "failed") return "danger";
  return "default";
}

function statusText(status) {
  const map = {
    draft: "草稿",
    running: "执行中",
    queued: "已入队",
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

function toDateValue(dateText) {
  if (!dateText) {
    return null;
  }

  let text = String(dateText);
  // SQLite CURRENT_TIMESTAMP 写入的是 UTC 时间但不带时区标记，补上 Z 再解析
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) {
    text = `${text.replace(" ", "T")}Z`;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

// 系统时间戳（created/updated/started 等）：完整年月日时分秒，上海时区
function formatTimestamp(dateText) {
  const date = toDateValue(dateText);
  if (!date) {
    return dateText || "暂无时间";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(date)
    .replaceAll("/", "-");
}

// 排期时间：用户输入的本地时间，原样展示（不做时区换算）
function formatSchedule(value) {
  if (!value) {
    return "未排期";
  }

  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  return text.replace("T", " ");
}

// datetime-local 输入框要求 YYYY-MM-DDTHH:mm(:ss) 格式，纯日期补 T00:00:00
function toDatetimeLocalValue(value) {
  if (!value) {
    return "";
  }

  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return `${text}T00:00:00`;
  }

  return text;
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

/* --------------------------------- 图标 ---------------------------------- */

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

function Icon({ d, className = "h-4 w-4", strokeWidth = 1.8, children }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {d ? <path d={d} /> : null}
      {children}
    </svg>
  );
}

function IconBot({ className = "h-5 w-5" }) {
  return (
    <Icon className={className}>
      <rect x="6" y="8" width="12" height="10" rx="3" />
      <path d="M12 4v4M9 13h.01M15 13h.01M9.5 16h5" />
    </Icon>
  );
}

function IconSend() {
  return <Icon className="h-4 w-4" d="M4 12 20 4 14 20l-2.5-5.5L4 12Z" />;
}

function IconRefresh({ className = "h-4 w-4" }) {
  return <Icon className={className} d="M20 12a8 8 0 1 1-2.34-5.66L20 9M20 4v5h-5" />;
}

function IconFolder({ className = "h-4 w-4" }) {
  return (
    <Icon
      className={className}
      d="M2 6a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z"
    />
  );
}

function IconArrowRight() {
  return <Icon className="h-4 w-4" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />;
}

function IconCalendar() {
  return (
    <Icon className="h-3.5 w-3.5">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18M8 2v4M16 2v4" />
    </Icon>
  );
}

function IconFileText({ className = "h-4 w-4" }) {
  return (
    <Icon className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </Icon>
  );
}

function IconClock() {
  return (
    <Icon className="h-3.5 w-3.5">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </Icon>
  );
}

function IconPlusCircle() {
  return (
    <Icon className="h-4 w-4" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v8M8 12h8" />
    </Icon>
  );
}

function IconEye() {
  return (
    <Icon className="h-4 w-4" strokeWidth={2}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

function IconLog() {
  return (
    <Icon className="h-4 w-4" strokeWidth={2}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </Icon>
  );
}

function IconTrash() {
  return (
    <Icon className="h-4 w-4" strokeWidth={2}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </Icon>
  );
}

function IconPen() {
  return (
    <Icon
      className="h-4 w-4"
      strokeWidth={2}
      d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z"
    />
  );
}

function IconCheck() {
  return <Icon className="h-3 w-3" strokeWidth={3} d="M20 6 9 17l-5-5" />;
}

/* -------------------------------- UI 组件 -------------------------------- */

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

function ActionIcon({ children, onClick, tone = "", disabled = false, title }) {
  return (
    <button
      type="button"
      title={title}
      className={["action-icon", tone ? `action-icon-${tone}` : ""].filter(Boolean).join(" ")}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function EmptyState({ icon, title, hint, minHeight }) {
  return (
    <div className="empty-state" style={minHeight ? { minHeight } : undefined}>
      <div className="card-glyph">{icon}</div>
      <strong>{title}</strong>
      <p>{hint}</p>
    </div>
  );
}

function Modal({ visible, title, subtitle, onClose, children, wide = false }) {
  if (!visible) {
    return null;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        style={wide ? { width: "min(880px, 100%)" } : undefined}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h3>{title}</h3>
            <p>{subtitle}</p>
          </div>
          <button className="modal-close" type="button" onClick={onClose}>
            ×
          </button>
        </div>
        <div>{children}</div>
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
      <div
        className="modal-card"
        style={{ width: "min(440px, 100%)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h3>{title || "确认操作"}</h3>
            <p>{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <ToolbarButton onClick={onCancel} disabled={loading}>
            取消
          </ToolbarButton>
          <ToolbarButton danger onClick={onConfirm} disabled={loading}>
            {loading ? "处理中..." : "确认"}
          </ToolbarButton>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- 应用 ---------------------------------- */

export function App() {
  const [screen, setScreen] = useState("settings");
  const [settingsTab, setSettingsTab] = useState("repository");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState("default");
  const [repository, setRepository] = useState(initialRepository);
  const [categories, setCategories] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [runs, setRuns] = useState([]);
  const [executors, setExecutors] = useState([]);
  const [defaultPlan, setDefaultPlan] = useState({
    enabled: true,
    defaultExecutorId: "codex-default",
    autoScheduleEnabled: false,
  });
  const [categoryForm, setCategoryForm] = useState(initialCategoryForm);
  const [draftForm, setDraftForm] = useState(initialDraftForm);
  const [generatedDraftId, setGeneratedDraftId] = useState(null);
  const [generatedItems, setGeneratedItems] = useState([]);
  const [historyCategory, setHistoryCategory] = useState("");
  const [queueCategory, setQueueCategory] = useState("");
  const [queueStatus, setQueueStatus] = useState("all");
  const [taskPage, setTaskPage] = useState(1);
  const [currentBatchId, setCurrentBatchId] = useState(null);
  const [currentBatchItems, setCurrentBatchItems] = useState([]);
  const [currentTaskId, setCurrentTaskId] = useState(null);
  const [taskEditor, setTaskEditor] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [picker, setPicker] = useState({
    visible: false,
    title: "",
    mode: "dir",
    loading: false,
    path: "",
    parent: null,
    directories: [],
    files: [],
    manual: "",
    onPick: null,
  });
  const [discover, setDiscover] = useState({
    visible: false,
    loading: false,
    items: [],
    executorId: null,
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
  }

  useEffect(() => {
    void runAction("", fetchCoreData);
  }, []);

  useEffect(() => {
    if (!message || messageTone !== "success") {
      return undefined;
    }

    const timer = setTimeout(() => setMessage(""), 4000);
    return () => clearTimeout(timer);
  }, [message, messageTone]);

  const hasRunningWork = useMemo(
    () =>
      tasks.some((task) => task.status === "running" || task.status === "queued") ||
      drafts.some((draft) => draft.status === "running"),
    [tasks, drafts],
  );

  // 有任务/草稿在后台执行时，每 5 秒静默刷新状态（不触发全局 loading）
  useEffect(() => {
    if (!hasRunningWork) {
      return undefined;
    }

    const timer = setInterval(async () => {
      try {
        const [tasksPayload, runsPayload, draftsPayload] = await Promise.all([
          api.listTasks(),
          api.listRuns(),
          api.listDrafts(),
        ]);
        setTasks(tasksPayload);
        setRuns(runsPayload);
        setDrafts(draftsPayload);
      } catch {
        // 轮询失败静默忽略，下一轮重试
      }
    }, 5000);

    return () => clearInterval(timer);
  }, [hasRunningWork]);

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

  const taskCategoryOptions = useMemo(
    () =>
      Array.from(new Set(tasks.map((task) => task.categoryName))).sort((left, right) =>
        left.localeCompare(right, "zh-CN"),
      ),
    [tasks],
  );

  const taskStatusCounts = useMemo(() => {
    const counts = { queued: 0, pending: 0, running: 0, done: 0, failed: 0 };
    tasks.forEach((task) => {
      if (counts[task.status] !== undefined) {
        counts[task.status] += 1;
      }
    });
    return counts;
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
    if (queueCategory && !taskCategoryOptions.includes(queueCategory)) {
      setQueueCategory("");
    }
  }, [taskCategoryOptions, queueCategory]);

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
    return tasks
      .filter((task) => !queueCategory || task.categoryName === queueCategory)
      .filter((task) => queueStatus === "all" || task.status === queueStatus)
      .sort((left, right) => {
        const statusDiff =
          (TASK_STATUS_ORDER[left.status] ?? 9) - (TASK_STATUS_ORDER[right.status] ?? 9);
        if (statusDiff !== 0) {
          return statusDiff;
        }
        // 执行中/已入队/待执行按执行时间升序（越早越靠前），已完成/已失败按更新时间倒序
        if (left.status === "pending" || left.status === "running" || left.status === "queued") {
          return (
            (left.scheduledDate || "9999-12-31").localeCompare(right.scheduledDate || "9999-12-31") ||
            left.id - right.id
          );
        }
        return (right.updatedAt || "").localeCompare(left.updatedAt || "") || right.id - left.id;
      });
  }, [queueCategory, queueStatus, tasks]);

  const totalTaskPages = Math.max(1, Math.ceil(queueTasks.length / TASK_PAGE_SIZE));

  const pagedTasks = useMemo(
    () => queueTasks.slice((taskPage - 1) * TASK_PAGE_SIZE, taskPage * TASK_PAGE_SIZE),
    [queueTasks, taskPage],
  );

  useEffect(() => {
    setTaskPage(1);
  }, [queueCategory, queueStatus]);

  useEffect(() => {
    if (taskPage > totalTaskPages) {
      setTaskPage(totalTaskPages);
    }
  }, [taskPage, totalTaskPages]);

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

  // 后台生成完成（轮询到 ready）后自动加载生成结果
  useEffect(() => {
    if (!generatedDraftId || generatedDraft?.status !== "ready" || generatedItems.length > 0) {
      return;
    }

    void api.getDraftItems(generatedDraftId).then(setGeneratedItems).catch(() => {});
  }, [generatedDraft, generatedDraftId, generatedItems.length]);

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
    const payload = await runAction("生成任务已提交，Agent 正在后台拟定计划。", async () => {
      const response = await api.generateDraft(draftForm);
      await fetchCoreData();
      return response;
    });

    if (payload) {
      setGeneratedDraftId(payload.draftId);
      setGeneratedItems([]);
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
      setScreen("queue-categories");
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

    const result = await runAction("任务已加入执行队列，将按顺序自动执行。", async () => {
      const response = await api.runTask(taskId, { executorId });
      await fetchCoreData();
      return response;
    });

    if (result) {
      setCurrentTaskId(taskId);
      setScreen("task-detail");
    }
  }

  async function handleDequeueTask(taskId) {
    await runAction("任务已取消排队，回到待执行状态。", async () => {
      await api.dequeueTask(taskId);
      await fetchCoreData();
    });
  }

  async function handlePushTask(taskId) {
    await runAction("推送成功，文章将由 GitHub Pages 自动发布。", async () => {
      await api.pushTask(taskId);
      await fetchCoreData();
    });
  }

  async function handleCreateDefaultTask() {
    const payload = await runAction("系统默认任务已同步。", async () => {
      // 先把界面上的自动化配置同步到服务端，避免开关未保存导致创建被拒绝
      const saved = await api.saveDefaultPlan(defaultPlan);
      setDefaultPlan(saved.settings || saved);
      const response = await api.createDefaultTask();
      await fetchCoreData();
      return response;
    });

    if (payload) {
      setQueueCategory(payload.categoryName);
      setQueueStatus("pending");
      setCurrentTaskId(payload.id);
      setScreen("queue-categories");
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
    await runAction("默认任务配置已保存。", async () => {
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
    await runAction(`${executor.name} 已保存。`, async () => {
      await api.updateExecutor(executor.id, {
        name: executor.name,
        command: executor.command,
        workingDirectory: executor.workingDirectory,
        timeoutMs: Number(executor.timeoutMs),
        enabled: executor.enabled,
      });
      await fetchCoreData();
    });
  }

  async function handleTestExecutorRow(executor) {
    const payload = await runAction("", async () => api.testExecutor(executor.id, {}));

    if (payload) {
      setMessage(payload.success ? `${executor.name} 测试成功。` : `${executor.name} 测试失败，请检查命令配置。`);
      setMessageTone(payload.success ? "success" : "danger");
      openLogModal(
        `执行器测试 / ${executor.name}`,
        payload.success ? "测试成功，以下是本次执行输出。" : "测试失败，以下是本次执行输出。",
        buildRunLogLines({
          promptText: payload.promptText,
          stdoutText: payload.stdoutText,
          stderrText: payload.stderrText,
        }),
      );
    }
  }

  async function loadPickerPath(targetPath, mode) {
    setPicker((current) => ({ ...current, loading: true }));
    try {
      const data = await api.browsePath(targetPath, mode === "file");
      setPicker((current) => ({
        ...current,
        loading: false,
        path: data.path,
        parent: data.parent,
        directories: data.directories || [],
        files: data.files || [],
        manual: data.path,
      }));
    } catch (error) {
      setPicker((current) => ({ ...current, loading: false }));
      setMessage(error.message);
      setMessageTone("danger");
    }
  }

  function openPicker({ title, mode = "dir", initialPath = "", onPick }) {
    setPicker({
      visible: true,
      title,
      mode,
      loading: true,
      path: "",
      parent: null,
      directories: [],
      files: [],
      manual: "",
      onPick,
    });
    void loadPickerPath(initialPath, mode);
  }

  function closePicker() {
    setPicker((current) => ({ ...current, visible: false, onPick: null }));
  }

  function pickPath(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) {
      return;
    }
    picker.onPick?.(trimmed);
    closePicker();
  }

  async function openDiscover(executorId) {
    setDiscover({ visible: true, loading: true, items: [], executorId });
    try {
      const items = await api.discoverExecutors();
      setDiscover((current) => ({ ...current, loading: false, items }));
    } catch (error) {
      setDiscover((current) => ({ ...current, loading: false }));
      setMessage(error.message);
      setMessageTone("danger");
    }
  }

  function commandParentDirectory(command) {
    const text = String(command || "");
    const index = Math.max(text.lastIndexOf("\\"), text.lastIndexOf("/"));
    return index > 0 ? text.slice(0, index) : "";
  }

  /* ------------------------------ 智能任务生成 ------------------------------ */

  function renderGenerate() {
    return (
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(360px,440px),minmax(0,1fr)] items-start">
        <section className="surface-panel">
          <div className="panel-head">
            <div className="flex items-center gap-3">
              <div className="card-glyph">
                <IconBot />
              </div>
              <div>
                <h3>拟定写作计划</h3>
                <p>Agent 只生成任务计划，不直接写文章。</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="field-block">
                <span>分类</span>
                <select
                  value={draftForm.categoryName}
                  onChange={(event) => setDraftForm((current) => ({ ...current, categoryName: event.target.value }))}
                  disabled={enabledCategories.length === 0}
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

              <label className="field-block">
                <span>执行器</span>
                <select
                  value={draftForm.executorId}
                  onChange={(event) => setDraftForm((current) => ({ ...current, executorId: event.target.value }))}
                >
                  {executors.map((executor) => (
                    <option key={executor.id} value={executor.id}>
                      {executor.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="field-block">
              <span>任务数量</span>
              <input
                type="number"
                min="1"
                max="30"
                value={draftForm.itemCount}
                onChange={(event) => setDraftForm((current) => ({ ...current, itemCount: Number(event.target.value) }))}
              />
            </label>

            <label className="field-block">
              <span>生成目标</span>
              <textarea
                rows="5"
                value={draftForm.goal}
                onChange={(event) => setDraftForm((current) => ({ ...current, goal: event.target.value }))}
                placeholder="描述希望这次生成的任务主题、边界或计划目标..."
              />
            </label>
          </div>

          <div className="panel-foot">
            <button
              type="button"
              onClick={handleGenerateDraft}
              disabled={loading || enabledCategories.length === 0 || generatedDraft?.status === "running"}
              className="toolbar-btn toolbar-btn-primary flex w-full items-center justify-center gap-2 !py-3"
            >
              {loading || generatedDraft?.status === "running" ? (
                <span className="spin inline-flex">
                  <IconRefresh />
                </span>
              ) : (
                <IconSend />
              )}
              <span>
                {generatedDraft?.status === "running" ? "后台生成中..." : loading ? "提交中..." : "生成智能任务"}
              </span>
            </button>
          </div>
        </section>

        {generatedDraft && generatedDraft.status === "running" ? (
          <EmptyState
            icon={
              <span className="spin inline-flex">
                <IconRefresh />
              </span>
            }
            title="Agent 正在拟定写作计划..."
            hint="通常需要 1-3 分钟，完成后结果会自动展示在这里，可离开此页面。"
            minHeight={420}
          />
        ) : generatedDraft && generatedDraft.status === "failed" && generatedItems.length === 0 ? (
          <div className="empty-state" style={{ minHeight: 420 }}>
            <div className="card-glyph">
              <IconBot />
            </div>
            <strong>生成失败</strong>
            <p>Agent 没有返回有效的任务计划，可查看日志排查原因后重新生成。</p>
            <div className="mt-3">
              <ToolbarButton
                onClick={() =>
                  openLogModal(
                    `草稿日志 / ${generatedDraft.categoryName}`,
                    generatedDraft.goal || "本次草稿生成日志。",
                    buildDraftLogLines(generatedDraft),
                  )
                }
              >
                查看日志
              </ToolbarButton>
            </div>
          </div>
        ) : generatedDraft && generatedItems.length > 0 ? (
          <section className="surface-panel">
            <div className="panel-head">
              <div>
                <h3>本次返回列表</h3>
                <p>生成结果仅在这里预览与调整，确认后进入任务列表。</p>
              </div>
              <div className="panel-actions">
                <ToolbarButton
                  onClick={() =>
                    openLogModal(
                      `草稿日志 / ${generatedDraft.categoryName}`,
                      generatedDraft.goal || "本次草稿生成日志。",
                      buildDraftLogLines(generatedDraft),
                    )
                  }
                >
                  查看日志
                </ToolbarButton>
                <ToolbarButton primary onClick={() => void handleConfirmDraft(generatedDraft.id)} disabled={loading}>
                  确认进入任务列表
                </ToolbarButton>
              </div>
            </div>

            <div className="edit-list stagger">
              {generatedItems.map((row) => (
                <div key={row.id} className="edit-item">
                  <div className="edit-form-fill">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <strong className="block font-semibold">{row.title}</strong>
                        <p className="mt-1 text-[13px] leading-6" style={{ color: "var(--ink-faint)" }}>
                          {row.contentBrief || "暂无摘要"}
                        </p>
                      </div>
                      <StatusPill tone="accent">{formatSchedule(row.scheduledDate)}</StatusPill>
                    </div>
                    <div className="inline-edit-grid">
                      <input
                        value={row.title}
                        onChange={(event) => updateGeneratedItem(row.id, "title", event.target.value)}
                      />
                      <input
                        value={toDatetimeLocalValue(row.scheduledDate)}
                        type="datetime-local"
                        step="1"
                        onChange={(event) => updateGeneratedItem(row.id, "scheduledDate", event.target.value)}
                      />
                      <ToolbarButton onClick={() => void saveDraftItem(row)}>保存</ToolbarButton>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <EmptyState
            icon={<IconBot />}
            title="暂无生成结果"
            hint="在左侧选择分类与执行器，填写生成目标后，点击「生成智能任务」即可开始。"
            minHeight={420}
          />
        )}
      </div>
    );
  }

  /* ---------------------------- 智能任务：分类层 ---------------------------- */

  function renderHistoryCategories() {
    const pendingTotal = historyCategoryCards.reduce((sum, item) => sum + item.pendingCount, 0);

    return (
      <div className="page-stack">
        <div className="sub-toolbar">
          <div className="panel-actions">
            <span className="stat-chip">
              共 <strong>{historyCategoryCards.length}</strong> 个分类
            </span>
            {pendingTotal > 0 && (
              <span className="stat-chip stat-chip-warn">
                待确认 <strong>{pendingTotal}</strong>
              </span>
            )}
          </div>
        </div>

        {historyCategoryCards.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 stagger">
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
                className="entry-card clickable"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="card-glyph">
                      <IconFolder />
                    </div>
                    <h4>{item.name}</h4>
                  </div>
                  <span className="card-arrow mt-1">
                    <IconArrowRight />
                  </span>
                </div>

                <div className="mb-3 flex items-center gap-5">
                  <span className="card-stats">
                    <strong>{item.batchCount}</strong> 个批次
                  </span>
                  <span className="card-stats">
                    <strong>{item.itemCount}</strong> 条任务
                  </span>
                </div>

                <p className="card-meta mb-4">最近更新 {formatTimestamp(item.latestDraft?.updatedAt)}</p>

                <div className="card-inset mt-auto">
                  <span style={{ color: item.pendingCount > 0 ? "var(--amber)" : "var(--ink-faint)" }}>
                    ● 待确认批次 {item.pendingCount} 个
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<IconFolder />}
            title="暂无分类数据"
            hint="生成任务后，这里会按分类展示对应的统计卡片。"
          />
        )}
      </div>
    );
  }

  /* ---------------------------- 智能任务：批次层 ---------------------------- */

  function renderHistoryBatches() {
    const categoryName = historyCategory || "未分类";

    return (
      <div className="page-stack">
        <div className="sub-toolbar">
          <div className="breadcrumb-lite">
            <button type="button" onClick={() => setScreen("history-categories")}>分类</button>
            <span>/</span>
            <strong>{categoryName}</strong>
          </div>
        </div>

        {batchCards.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 stagger">
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
                className="entry-card clickable"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="card-meta inline-flex items-center gap-1.5">
                    <IconCalendar />
                    {formatTimestamp(item.updatedAt)}
                  </span>
                  <StatusPill tone={statusTone(item.status)}>{statusText(item.status)}</StatusPill>
                </div>

                <h4 className="mb-4 line-clamp-2" style={{ fontSize: "15px" }}>
                  {item.goal || `${item.categoryName} · 常规批次`}
                </h4>

                <div className="mb-4 flex items-center justify-between gap-3">
                  <span className="card-stats">
                    <strong>{item.itemCount || 0}</strong> 条草稿任务
                  </span>
                  <span className="card-meta font-mono text-[11px]">{item.executorId}</span>
                </div>

                <div className="card-foot">
                  <span className="card-meta">批次 #{item.id}</span>
                  <div className="card-actions">
                    <ActionIcon
                      title="详情"
                      onClick={(event) => {
                        event.stopPropagation();
                        setCurrentBatchId(item.id);
                        setScreen("batch-detail");
                      }}
                    >
                      <IconEye />
                    </ActionIcon>
                    <ActionIcon
                      title="日志"
                      onClick={(event) => {
                        event.stopPropagation();
                        openLogModal(
                          `草稿日志 / ${item.categoryName}`,
                          item.goal || "当前草稿批次日志。",
                          buildDraftLogLines(item),
                        );
                      }}
                    >
                      <IconLog />
                    </ActionIcon>
                    <ActionIcon
                      title="删除"
                      tone="danger"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDeleteDraft(item.id);
                      }}
                    >
                      <IconTrash />
                    </ActionIcon>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<IconFileText />}
            title="暂无批次数据"
            hint="该分类下还没有生成批次，请先在智能任务生成页面创建。"
          />
        )}
      </div>
    );
  }

  /* --------------------------- 智能任务：任务项层 --------------------------- */

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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 stagger">
            {currentBatchItems.map((item) => {
              const isPushed = item.status === "confirmed" || isConfirmedBatch;
              const isSelected = selectedItems.has(item.id);

              return (
                <div
                  key={item.id}
                  className={[
                    "entry-card",
                    isPushed ? "confirmed-card" : "",
                    isSelected ? "selectable-selected" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className="mb-3 flex items-start gap-3">
                    {!isPushed && (
                      <label className="mt-1 flex-shrink-0">
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(item.id)} />
                      </label>
                    )}
                    <h4 className="flex-1" style={{ fontSize: "15px" }}>
                      {item.title}
                      {isPushed && (
                        <span
                          className="ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 align-middle text-[11px] font-medium"
                          style={{ background: "var(--moss-soft)", color: "var(--moss)" }}
                        >
                          <IconCheck />
                          已加入
                        </span>
                      )}
                    </h4>
                  </div>

                  <p className="mb-4 text-[13px] leading-relaxed line-clamp-3" style={{ color: "var(--ink-soft)" }}>
                    {item.contentBrief || "暂无描述"}
                  </p>

                  <div className="mb-4">
                    <span className="card-inset inline-flex items-center gap-1.5">
                      <IconClock />
                      {formatSchedule(item.scheduledDate)}
                    </span>
                  </div>

                  <div className="card-foot">
                    <span className="card-meta">
                      序号 {item.orderNo} · {categoryName}
                    </span>
                    <div className="card-actions">
                      {!isPushed && (
                        <ActionIcon
                          title="加入任务列表"
                          tone="success"
                          disabled={loading}
                          onClick={() => void handlePushDraftItem(item)}
                        >
                          <IconPlusCircle />
                        </ActionIcon>
                      )}
                      <ActionIcon title="编辑" onClick={() => setEditItem({ ...item })}>
                        <IconPen />
                      </ActionIcon>
                      <ActionIcon title="删除" tone="danger" onClick={() => void handleDeleteDraftItem(item.id)}>
                        <IconTrash />
                      </ActionIcon>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={<IconFileText />} title="暂无任务项" hint="该批次中还没有生成任务项。" />
        )}

        <Modal
          visible={editItem !== null}
          title="编辑任务项"
          subtitle="修改标题、描述和排期日期。"
          onClose={() => setEditItem(null)}
        >
          {editItem && (
            <div className="grid gap-4">
              <label className="field-block">
                <span>任务标题</span>
                <input
                  value={editItem.title}
                  onChange={(event) => setEditItem((current) => ({ ...current, title: event.target.value }))}
                />
              </label>
              <label className="field-block">
                <span>任务描述</span>
                <textarea
                  rows="4"
                  value={editItem.contentBrief}
                  onChange={(event) => setEditItem((current) => ({ ...current, contentBrief: event.target.value }))}
                />
              </label>
              <label className="field-block">
                <span>执行时间（可精确到秒）</span>
                <input
                  type="datetime-local"
                  step="1"
                  value={toDatetimeLocalValue(editItem.scheduledDate)}
                  onChange={(event) => setEditItem((current) => ({ ...current, scheduledDate: event.target.value }))}
                />
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <ToolbarButton onClick={() => setEditItem(null)}>取消</ToolbarButton>
                <ToolbarButton
                  primary
                  onClick={async () => {
                    await saveDraftItem(editItem);
                    setEditItem(null);
                  }}
                >
                  保存
                </ToolbarButton>
              </div>
            </div>
          )}
        </Modal>
      </div>
    );
  }

  /* ------------------------------- 批次详情/编辑 ---------------------------- */

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
            <div className="kv-item"><span>执行器</span><strong className="font-mono text-[13px]">{currentBatch.executorId}</strong></div>
            <div className="kv-item"><span>任务数量</span><strong>{currentBatch.itemCount || 0} 条</strong></div>
            <div className="kv-item"><span>状态</span><strong>{statusText(currentBatch.status)}</strong></div>
            <div className="kv-item"><span>最近更新</span><strong>{formatTimestamp(currentBatch.updatedAt)}</strong></div>
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
              <div key={item.id} className="edit-item">
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
                      type="datetime-local"
                      step="1"
                      value={toDatetimeLocalValue(item.scheduledDate)}
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

  /* ------------------------------- 任务列表看板 ------------------------------ */

  function renderTaskBoard() {
    return (
      <div className="page-stack">
        <div className="sub-toolbar" style={{ alignItems: "flex-start" }}>
          <div className="grid gap-2">
            <div className="filter-row">
              <span>分类</span>
              <div className="tab-cluster">
                <button
                  type="button"
                  className={queueCategory === "" ? "active" : ""}
                  onClick={() => setQueueCategory("")}
                >
                  全部
                </button>
                {taskCategoryOptions.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className={queueCategory === name ? "active" : ""}
                    onClick={() => setQueueCategory(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
            <div className="filter-row">
              <span>状态</span>
              <div className="tab-cluster">
                {taskFilterTabs.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={queueStatus === item.id ? "active" : ""}
                    onClick={() => setQueueStatus(item.id)}
                  >
                    {item.label}
                    {item.id !== "all" && taskStatusCounts[item.id] > 0
                      ? ` (${taskStatusCounts[item.id]})`
                      : ""}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="panel-actions">
            <ToolbarButton
              onClick={() => void handleCreateDefaultTask()}
              disabled={!defaultPlan.enabled || (!defaultTask && defaultPoolCategories.length === 0)}
            >
              {defaultTask ? "查看系统默认任务" : "同步系统默认任务"}
            </ToolbarButton>
          </div>
        </div>

        {pagedTasks.length > 0 ? (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 stagger">
              {pagedTasks.map((item) => (
                <div key={item.id} className="entry-card">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <h4 className="flex-1" style={{ fontSize: "15px" }}>{item.title}</h4>
                    <StatusPill tone={statusTone(item.status)}>{statusText(item.status)}</StatusPill>
                  </div>

                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <span className="card-inset inline-flex items-center gap-1.5 !py-1.5">
                      <IconClock />
                      {formatSchedule(item.scheduledDate)}
                    </span>
                    <span className="card-meta">{item.categoryName} · {taskTypeText(item.taskType)}</span>
                  </div>

                  <p className="mb-4 text-[13px] leading-relaxed line-clamp-2" style={{ color: "var(--ink-soft)" }}>
                    {item.items?.[0]?.contentBrief || item.items?.[0]?.title || "暂无描述"}
                  </p>

                  <div className="card-foot">
                    <span className="card-meta">#{item.id}</span>
                    <div className="card-actions">
                      <ActionIcon
                        title="详情"
                        onClick={() => {
                          setCurrentTaskId(item.id);
                          setScreen("task-detail");
                        }}
                      >
                        <IconEye />
                      </ActionIcon>
                      {item.status === "pending" && (
                        <ActionIcon
                          title="编辑"
                          onClick={() => {
                            setCurrentTaskId(item.id);
                            setScreen("task-edit");
                          }}
                        >
                          <IconPen />
                        </ActionIcon>
                      )}
                      {item.status === "failed" && (
                        <ActionIcon title="重新执行" tone="success" disabled={loading} onClick={() => void handleRunTask(item.id)}>
                          <IconRefresh />
                        </ActionIcon>
                      )}
                      <ActionIcon
                        title="日志"
                        onClick={() => openLogModal(
                          `任务日志 / ${item.title}`,
                          "这里展示任务最近一次运行日志。",
                          buildRunLogLines(runs.find((run) => run.taskId === item.id) || null),
                        )}
                      >
                        <IconLog />
                      </ActionIcon>
                      <ActionIcon title="删除" tone="danger" onClick={() => void handleDeleteTask(item.id)}>
                        <IconTrash />
                      </ActionIcon>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {totalTaskPages > 1 ? (
              <div className="pager">
                <ToolbarButton onClick={() => setTaskPage((page) => Math.max(1, page - 1))} disabled={taskPage <= 1}>
                  上一页
                </ToolbarButton>
                <span>
                  第 {taskPage} / {totalTaskPages} 页 · 共 {queueTasks.length} 条
                </span>
                <ToolbarButton
                  onClick={() => setTaskPage((page) => Math.min(totalTaskPages, page + 1))}
                  disabled={taskPage >= totalTaskPages}
                >
                  下一页
                </ToolbarButton>
              </div>
            ) : (
              <p className="text-center text-[12px]" style={{ color: "var(--ink-faint)" }}>
                共 {queueTasks.length} 条任务
              </p>
            )}
          </>
        ) : (
          <EmptyState
            icon={<IconFileText />}
            title="暂无匹配任务"
            hint="调整上方筛选条件，或先在智能任务生成页创建并确认草稿。"
          />
        )}
      </div>
    );
  }

  /* -------------------------------- 任务详情 -------------------------------- */

  function renderTaskDetail() {
    if (!currentTask) {
      return <div className="empty-inline">当前没有可查看的任务。</div>;
    }

    return (
      <div className="page-stack">
        <div className="sub-toolbar">
          <div className="breadcrumb-lite">
            <button type="button" onClick={() => setScreen("queue-categories")}>任务列表</button>
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
            {currentTask.status === "queued" ? (
              <ToolbarButton onClick={() => void handleDequeueTask(currentTask.id)} disabled={loading}>
                取消排队
              </ToolbarButton>
            ) : null}
            {currentTask.status === "pending" ? (
              <ToolbarButton onClick={() => setScreen("task-edit")}>进入编辑页</ToolbarButton>
            ) : null}
          </div>
        </div>

        <div className="split-layout">
          <section className="surface-panel">
            <div className="kv-grid">
              <div className="kv-item"><span>任务标题</span><strong>{currentTask.title}</strong></div>
              <div className="kv-item"><span>分类</span><strong>{currentTask.categoryName}</strong></div>
              <div className="kv-item"><span>执行时间</span><strong>{formatSchedule(currentTask.scheduledDate)}</strong></div>
              <div className="kv-item"><span>任务来源</span><strong>{taskTypeText(currentTask.taskType)}</strong></div>
              <div className="kv-item"><span>状态</span><strong>{statusText(currentTask.status)}</strong></div>
              <div className="kv-item"><span>执行器</span><strong className="font-mono text-[13px]">{currentTask.executorId || "未指定"}</strong></div>
            </div>

            {currentTask.status === "running" ? (
              <div className="card-inset mt-4" style={{ borderStyle: "solid" }}>
                <span className="inline-flex items-center gap-2">
                  <span className="spin inline-flex" style={{ color: "var(--amber)" }}>
                    <IconRefresh className="h-3.5 w-3.5" />
                  </span>
                  任务正在后台执行，写一篇文章通常需要几分钟，状态每 5 秒自动刷新，可离开此页面。
                </span>
              </div>
            ) : null}

            {currentTask.status === "queued" ? (
              <div className="card-inset mt-4" style={{ borderStyle: "solid" }}>
                <span className="inline-flex items-center gap-2">
                  <IconClock />
                  已加入执行队列，将按顺序自动执行（同一时刻只执行一个任务），状态每 5 秒自动刷新。
                </span>
              </div>
            ) : null}

            {currentTask.articlePath || currentTask.publishResult ? (
              <div className="publish-panel">
                <h4>发布结果</h4>
                <dl>
                  {currentTask.articleTitle ? (
                    <div>
                      <dt>文章标题</dt>
                      <dd>{currentTask.articleTitle}</dd>
                    </div>
                  ) : null}
                  {currentTask.articlePath ? (
                    <div>
                      <dt>文章路径</dt>
                      <dd className="mono">{currentTask.articlePath}</dd>
                    </div>
                  ) : null}
                  {currentTask.publishResult ? (
                    <>
                      <div>
                        <dt>Git 状态</dt>
                        <dd>
                          {currentTask.publishResult.committed ? "已提交" : "未提交"}
                          <span style={{ margin: "0 8px", color: "var(--line-strong)" }}>·</span>
                          {currentTask.publishResult.pushed
                            ? `已推送到 ${currentTask.publishResult.branch}`
                            : "未推送"}
                        </dd>
                      </div>
                      {currentTask.publishResult.pushError ? (
                        <div>
                          <dt>推送失败原因</dt>
                          <dd className="publish-error">{currentTask.publishResult.pushError}</dd>
                        </div>
                      ) : null}
                      {currentTask.publishResult.pushSkipped && !currentTask.publishResult.pushed ? (
                        <div>
                          <dt>推送说明</dt>
                          <dd>{currentTask.publishResult.pushSkipped}</dd>
                        </div>
                      ) : null}
                      {Array.isArray(currentTask.publishResult.files) && currentTask.publishResult.files.length > 1 ? (
                        <div>
                          <dt>提交文件</dt>
                          <dd className="mono">{currentTask.publishResult.files.join("\n")}</dd>
                        </div>
                      ) : null}
                      {Array.isArray(currentTask.publishResult.fixedFrontMatterFields) &&
                      currentTask.publishResult.fixedFrontMatterFields.length > 0 ? (
                        <div>
                          <dt>已自动补齐 front-matter 字段</dt>
                          <dd>{currentTask.publishResult.fixedFrontMatterFields.join("、")}</dd>
                        </div>
                      ) : null}
                      {currentTask.publishResult.error ? (
                        <div>
                          <dt>发布出错</dt>
                          <dd className="publish-error">{currentTask.publishResult.error}</dd>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </dl>
                {currentTask.articlePath && !currentTask.publishResult?.pushed ? (
                  <div className="mt-3 flex justify-end">
                    <ToolbarButton primary onClick={() => void handlePushTask(currentTask.id)} disabled={loading}>
                      手动推送到远端
                    </ToolbarButton>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="surface-panel">
            <div className="panel-head">
              <div>
                <h3>知识点与结果</h3>
                <p>{latestTaskRun ? `最近运行：${formatTimestamp(latestTaskRun.startedAt)}` : "暂无运行记录"}</p>
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

  /* -------------------------------- 任务编辑 -------------------------------- */

  function renderTaskEdit() {
    if (!taskEditor) {
      return <div className="empty-inline">当前没有可编辑的任务。</div>;
    }

    return (
      <div className="page-stack">
        <div className="sub-toolbar">
          <div className="breadcrumb-lite">
            <button type="button" onClick={() => setScreen("queue-categories")}>任务列表</button>
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
              <div className="edit-item">
                <div className="edit-form-fill">
                  <label className="field-block">
                    <span>任务标题</span>
                    <input
                      value={taskEditor.title}
                      onChange={(event) => setTaskEditor((current) => (current ? { ...current, title: event.target.value } : current))}
                    />
                  </label>
                  <label className="field-block">
                    <span>执行时间（可精确到秒）</span>
                    <input
                      type="datetime-local"
                      step="1"
                      value={toDatetimeLocalValue(taskEditor.scheduledDate)}
                      onChange={(event) =>
                        setTaskEditor((current) => (current ? { ...current, scheduledDate: event.target.value } : current))
                      }
                    />
                  </label>
                </div>
              </div>

              {taskEditor.items.map((item) => (
                <div key={item.id} className="edit-item">
                  <div className="edit-form-fill">
                    <input value={item.title} onChange={(event) => updateTaskEditorItem(item.id, "title", event.target.value)} />
                    <textarea rows="3" value={item.contentBrief} onChange={(event) => updateTaskEditorItem(item.id, "contentBrief", event.target.value)} />
                    <div className="inline-edit-grid">
                      <label className="field-block">
                        <span>序号</span>
                        <input
                          type="number"
                          value={item.orderNo}
                          onChange={(event) => updateTaskEditorItem(item.id, "orderNo", Number(event.target.value))}
                        />
                      </label>
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

  /* -------------------------------- 配置中心 -------------------------------- */

  function renderSettingsRepository() {
    return (
      <section className="surface-panel rise">
        <div className="panel-head">
          <div>
            <h3>仓库与发布</h3>
            <p>博客仓库的位置、目标分支与文档目录，以及执行成功后的推送策略。</p>
          </div>
        </div>

        <div className="form-blocks">
          <div className="field-block wide field-mono">
            <span>仓库路径</span>
            <div className="flex gap-2">
              <input
                className="flex-1"
                value={repository.path}
                onChange={(event) => setRepository((current) => ({ ...current, path: event.target.value }))}
              />
              <ToolbarButton
                onClick={() =>
                  openPicker({
                    title: "选择博客仓库目录",
                    mode: "dir",
                    initialPath: repository.path,
                    onPick: (value) => setRepository((current) => ({ ...current, path: value })),
                  })
                }
              >
                选择目录
              </ToolbarButton>
            </div>
            <p>可直接输入，也可以通过目录浏览选择。</p>
          </div>
          <label className="field-block field-mono">
            <span>目标分支</span>
            <input value={repository.branch} onChange={(event) => setRepository((current) => ({ ...current, branch: event.target.value }))} />
          </label>
          <label className="field-block field-mono">
            <span>文档目录</span>
            <input value={repository.docsDir} onChange={(event) => setRepository((current) => ({ ...current, docsDir: event.target.value }))} />
          </label>
          <label className="toggle-row wide" style={{ gridColumn: "span 2" }}>
            <input
              type="checkbox"
              checked={repository.autoPush}
              onChange={(event) => setRepository((current) => ({ ...current, autoPush: event.target.checked }))}
            />
            <span>
              <strong>自动推送 Git</strong>
              <p>任务执行成功并提交后，自动 push 到远端分支，GitHub Pages 随之发布上线。</p>
            </span>
          </label>
        </div>

        <div className="panel-foot">
          <ToolbarButton primary onClick={() => void handleSaveRepository()} disabled={loading}>保存仓库配置</ToolbarButton>
        </div>
      </section>
    );
  }

  function renderSettingsAutomation() {
    return (
      <section className="surface-panel rise">
        <div className="panel-head">
          <div>
            <h3>自动化与默认任务</h3>
            <p>控制系统默认任务、默认执行器以及到期任务的定时自动执行。</p>
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
            <p>系统默认任务与定时调度执行时使用的执行器。</p>
          </label>
          <div className="field-block">
            <span>默认任务池</span>
            <div className="card-inset" style={{ padding: "12px 14px" }}>
              当前有 <strong>{defaultPoolCategories.length}</strong> 个分类加入默认池，可供系统默认任务随机选类。
              可在「分类管理」标签页调整。
            </div>
          </div>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={defaultPlan.enabled}
              onChange={(event) => setDefaultPlan((current) => ({ ...current, enabled: event.target.checked }))}
            />
            <span>
              <strong>启用系统内置默认任务</strong>
              <p>关闭后会移除唯一的系统默认任务；开启后会按默认分类池自动保留 1 条。</p>
            </span>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={defaultPlan.autoScheduleEnabled}
              onChange={(event) =>
                setDefaultPlan((current) => ({ ...current, autoScheduleEnabled: event.target.checked }))
              }
            />
            <span>
              <strong>到期任务自动执行</strong>
              <p>开启后，服务端每分钟检查一次执行日期已到的待执行任务，用默认执行器自动写作并发布。</p>
            </span>
          </label>
        </div>

        <div className="panel-foot">
          <ToolbarButton primary onClick={() => void handleSaveDefaultPlan()} disabled={loading}>保存自动化配置</ToolbarButton>
          <ToolbarButton
            onClick={() => void handleCreateDefaultTask()}
            disabled={!defaultPlan.enabled || (!defaultTask && defaultPoolCategories.length === 0)}
          >
            {defaultTask ? "同步并定位默认任务" : "立即创建默认任务"}
          </ToolbarButton>
        </div>
      </section>
    );
  }

  function renderSettingsCategories() {
    return (
      <div className="page-stack rise" style={{ padding: 0 }}>
        <section className="surface-panel">
          <div className="panel-head">
            <div>
              <h3>新增自定义分类</h3>
              <p>除仓库扫描外，也可以手动添加一个新分类，首篇文章发布时会自动建目录。</p>
            </div>
          </div>

          <div className="form-blocks">
            <label className="field-block wide">
              <span>分类名称</span>
              <input
                value={categoryForm.name}
                placeholder="例如：React 性能优化"
                onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={categoryForm.enabled}
                onChange={(event) => setCategoryForm((current) => ({ ...current, enabled: event.target.checked }))}
              />
              <span>
                <strong>立即启用</strong>
                <p>启用后可在智能任务生成页选择该分类。</p>
              </span>
            </label>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={categoryForm.isDefaultPool}
                onChange={(event) => setCategoryForm((current) => ({ ...current, isDefaultPool: event.target.checked }))}
              />
              <span>
                <strong>加入默认任务池</strong>
                <p>加入后，系统默认任务会将其纳入随机选类范围。</p>
              </span>
            </label>
          </div>
          <div className="panel-foot">
            <ToolbarButton primary onClick={() => void handleCreateCategory()} disabled={loading}>新增分类</ToolbarButton>
          </div>
        </section>

        <section className="surface-panel">
          <div className="panel-head">
            <div>
              <h3>分类列表</h3>
              <p>维护哪些分类允许生成任务、哪些进入默认任务池。扫描会从博客仓库同步分类与文章索引，新分类默认加入默认任务池。</p>
            </div>
            <div className="panel-actions">
              <span className="stat-chip">
                共 <strong>{categories.length}</strong> 个分类
              </span>
              <ToolbarButton primary onClick={() => void handleScanRepository()} disabled={loading}>
                扫描仓库分类
              </ToolbarButton>
            </div>
          </div>

          <div className="mini-list">
            {categories.length > 0 ? categories.map((category) => (
              <div key={category.id} className="mini-list-row">
                <div className="list-fill">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong style={{ fontFamily: "var(--font-display)", fontSize: "15px" }}>{category.name}</strong>
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
                  <div className="flex flex-wrap items-center gap-5">
                    <label className="inline-flex items-center gap-2 text-[13px]" style={{ color: "var(--ink-soft)" }}>
                      <input
                        type="checkbox"
                        checked={category.enabled}
                        onChange={(event) => updateCategoryDraft(category.id, "enabled", event.target.checked)}
                      />
                      允许用于生成任务
                    </label>
                    <label className="inline-flex items-center gap-2 text-[13px]" style={{ color: "var(--ink-soft)" }}>
                      <input
                        type="checkbox"
                        checked={category.isDefaultPool}
                        onChange={(event) => updateCategoryDraft(category.id, "isDefaultPool", event.target.checked)}
                      />
                      加入默认任务池
                    </label>
                  </div>
                </div>
                <div className="mini-list-actions">
                  <ToolbarButton onClick={() => void handleSaveCategory(category)} disabled={loading}>保存</ToolbarButton>
                </div>
              </div>
            )) : (
              <div className="empty-inline">还没有分类。点击上方「扫描仓库分类」从博客仓库同步，或手动新增一个自定义分类。</div>
            )}
          </div>
        </section>
      </div>
    );
  }

  function renderSettingsExecutors() {
    return (
      <div className="page-stack rise" style={{ padding: 0 }}>
        <section className="surface-panel">
          <div className="panel-head">
            <div>
              <h3>执行器列表</h3>
              <p>执行器是本机的 CLI Agent 命令，负责实际的计划生成与文章写作。命令可自动扫描、浏览文件或手动输入；配置修改后点「测试」即可验证。</p>
            </div>
          </div>
          <div className="mini-list">
            {executors.map((executor) => (
              <div key={executor.id} className="mini-list-row">
                <div className="list-fill">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong style={{ fontFamily: "var(--font-display)", fontSize: "15px" }}>{executor.name}</strong>
                    <StatusPill tone={executor.enabled ? "success" : "default"}>
                      {executor.enabled ? "启用中" : "已停用"}
                    </StatusPill>
                  </div>
                  <p className="font-mono text-[11.5px]">{executor.id} · {executor.type}</p>
                  <div className="grid gap-3">
                    <label className="field-block">
                      <span>名称</span>
                      <input
                        value={executor.name}
                        onChange={(event) => handleExecutorChange(executor.id, "name", event.target.value)}
                      />
                    </label>
                    <div className="field-block field-mono">
                      <span>命令</span>
                      <div className="flex flex-wrap gap-2">
                        <input
                          className="min-w-[220px] flex-1"
                          value={executor.command}
                          onChange={(event) => handleExecutorChange(executor.id, "command", event.target.value)}
                        />
                        <ToolbarButton onClick={() => void openDiscover(executor.id)}>自动扫描</ToolbarButton>
                        <ToolbarButton
                          onClick={() =>
                            openPicker({
                              title: "选择执行器命令文件",
                              mode: "file",
                              initialPath: commandParentDirectory(executor.command),
                              onPick: (value) => handleExecutorChange(executor.id, "command", value),
                            })
                          }
                        >
                          浏览文件
                        </ToolbarButton>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="field-block field-mono">
                        <span>工作目录（Agent 在该目录下执行）</span>
                        <div className="flex gap-2">
                          <input
                            className="flex-1"
                            value={executor.workingDirectory}
                            onChange={(event) => handleExecutorChange(executor.id, "workingDirectory", event.target.value)}
                          />
                          <ToolbarButton
                            onClick={() =>
                              openPicker({
                                title: "选择工作目录",
                                mode: "dir",
                                initialPath: executor.workingDirectory,
                                onPick: (value) => handleExecutorChange(executor.id, "workingDirectory", value),
                              })
                            }
                          >
                            选择
                          </ToolbarButton>
                        </div>
                      </div>
                      <label className="field-block">
                        <span>超时（毫秒）</span>
                        <input
                          type="number"
                          min="1000"
                          step="1000"
                          value={executor.timeoutMs}
                          onChange={(event) => handleExecutorChange(executor.id, "timeoutMs", Number(event.target.value))}
                        />
                      </label>
                    </div>
                    <label className="inline-flex items-center gap-2 text-[13px]" style={{ color: "var(--ink-soft)" }}>
                      <input
                        type="checkbox"
                        checked={executor.enabled}
                        onChange={(event) => handleExecutorChange(executor.id, "enabled", event.target.checked)}
                      />
                      启用该执行器
                    </label>
                  </div>
                </div>
                <div className="mini-list-actions">
                  <ToolbarButton primary onClick={() => void handleSaveExecutor(executor)} disabled={loading}>保存</ToolbarButton>
                  <ToolbarButton onClick={() => void handleTestExecutorRow(executor)} disabled={loading}>
                    {loading ? "执行中..." : "测试"}
                  </ToolbarButton>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  function renderSettings() {
    return (
      <div>
        <div className="settings-tabs" role="tablist">
          {SETTINGS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={settingsTab === tab.id}
              className={`settings-tab ${settingsTab === tab.id ? "active" : ""}`}
              onClick={() => setSettingsTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {settingsTab === "repository" ? renderSettingsRepository() : null}
        {settingsTab === "automation" ? renderSettingsAutomation() : null}
        {settingsTab === "categories" ? renderSettingsCategories() : null}
        {settingsTab === "executors" ? renderSettingsExecutors() : null}
      </div>
    );
  }

  /* --------------------------------- 渲染 ---------------------------------- */

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
        return renderTaskBoard();
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

  const pageMeta = PAGE_META[screen] || { title: "", subtitle: "" };

  return (
    <>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            <span className="brand-seal" aria-hidden="true">砚</span>
            <div>
              <h1>砚台</h1>
              <p>博客自动写作台</p>
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
          <div className="sidebar-foot">INKSTONE · 砚台</div>
        </aside>

        <main className="workspace">
          <header className="page-header">
            <div>
              <h2>
                {pageMeta.title}
                <em aria-hidden="true" />
              </h2>
              <p className="page-sub">{pageMeta.subtitle}</p>
            </div>
            <div className="panel-actions">
              <ToolbarButton onClick={() => void handleRefresh()} disabled={loading}>
                <span className={`inline-flex items-center gap-1.5 ${loading ? "" : ""}`}>
                  <span className={loading ? "spin inline-flex" : "inline-flex"}>
                    <IconRefresh className="h-3.5 w-3.5" />
                  </span>
                  刷新数据
                </span>
              </ToolbarButton>
            </div>
          </header>

          {renderContent()}
        </main>
      </div>

      {message ? (
        <div key={message} className={`toast toast-${messageTone}`} role="status">
          {message}
        </div>
      ) : null}

      <Modal
        visible={picker.visible}
        title={picker.title || "选择路径"}
        subtitle={picker.mode === "file" ? "进入目录后点击文件即可选中，也可以直接在下方输入完整路径。" : "浏览到目标目录后点「选择当前目录」，也可以直接输入完整路径。"}
        onClose={closePicker}
      >
        <div className="grid gap-3">
          <div className="flex gap-2">
            <input
              className="flex-1 font-mono text-[12.5px]"
              value={picker.manual}
              placeholder="输入完整路径后回车或点击跳转"
              onChange={(event) => setPicker((current) => ({ ...current, manual: event.target.value }))}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void loadPickerPath(picker.manual, picker.mode);
                }
              }}
            />
            <ToolbarButton onClick={() => void loadPickerPath(picker.manual, picker.mode)} disabled={picker.loading}>
              跳转
            </ToolbarButton>
            {picker.mode === "file" ? (
              <ToolbarButton primary onClick={() => pickPath(picker.manual)}>使用该路径</ToolbarButton>
            ) : null}
          </div>

          <div className="picker-list">
            {picker.parent !== null && picker.path ? (
              <button type="button" className="picker-row" onClick={() => void loadPickerPath(picker.parent, picker.mode)}>
                <span className="card-glyph !h-7 !w-7 !rounded-lg"><IconArrowRight /></span>
                <span>.. 返回上级</span>
              </button>
            ) : null}
            {picker.loading ? (
              <div className="empty-inline">读取目录中...</div>
            ) : (
              <>
                {picker.directories.map((dir) => (
                  <button
                    key={dir.path}
                    type="button"
                    className="picker-row"
                    onClick={() => void loadPickerPath(dir.path, picker.mode)}
                  >
                    <span className="card-glyph !h-7 !w-7 !rounded-lg"><IconFolder className="h-3.5 w-3.5" /></span>
                    <span className="truncate">{dir.name}</span>
                  </button>
                ))}
                {picker.mode === "file"
                  ? picker.files.map((file) => (
                      <button key={file.path} type="button" className="picker-row" onClick={() => pickPath(file.path)}>
                        <span className="card-glyph !h-7 !w-7 !rounded-lg"><IconFileText className="h-3.5 w-3.5" /></span>
                        <span className="truncate">{file.name}</span>
                      </button>
                    ))
                  : null}
                {!picker.directories.length && (picker.mode !== "file" || !picker.files.length) ? (
                  <div className="empty-inline">该目录下没有可选内容。</div>
                ) : null}
              </>
            )}
          </div>

          {picker.mode === "dir" ? (
            <div className="flex justify-end gap-2 border-t pt-3" style={{ borderColor: "var(--line)" }}>
              <ToolbarButton onClick={closePicker}>取消</ToolbarButton>
              <ToolbarButton primary onClick={() => pickPath(picker.path || picker.manual)} disabled={picker.loading || !picker.path}>
                选择当前目录
              </ToolbarButton>
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        visible={discover.visible}
        title="自动扫描执行器命令"
        subtitle="已在本机 PATH 中扫描常见的 CLI Agent 命令，点击即可填入。"
        onClose={() => setDiscover((current) => ({ ...current, visible: false }))}
      >
        <div className="picker-list">
          {discover.loading ? (
            <div className="empty-inline">扫描中...</div>
          ) : discover.items.length > 0 ? (
            discover.items.map((item) => (
              <button
                key={item.command}
                type="button"
                className="picker-row"
                onClick={() => {
                  if (discover.executorId) {
                    handleExecutorChange(discover.executorId, "command", item.command);
                  }
                  setDiscover((current) => ({ ...current, visible: false }));
                }}
              >
                <span className="card-glyph !h-7 !w-7 !rounded-lg"><IconBot className="h-3.5 w-3.5" /></span>
                <span className="min-w-0">
                  <span className="block font-medium">{item.name}</span>
                  <span className="block truncate font-mono text-[11.5px]" style={{ color: "var(--ink-faint)" }}>
                    {item.command}
                  </span>
                </span>
              </button>
            ))
          ) : (
            <div className="empty-inline">
              没有扫描到已知的 CLI Agent 命令（codex / claude / gemini 等），请用「浏览文件」或手动输入。
            </div>
          )}
        </div>
      </Modal>

      <Modal
        visible={logModal.visible}
        title={logModal.title}
        subtitle={logModal.subtitle}
        onClose={() => setLogModal({ visible: false, title: "", subtitle: "", lines: [] })}
        wide
      >
        <div className="log-terminal">
          <div className="log-lines">
            {logModal.lines.map((line) => (
              <div key={line} className="log-line">{line}</div>
            ))}
          </div>
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

const API_BASE_URL = "http://localhost:4321/api";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || `Request failed: ${response.status}`);
  }

  return response.json();
}

export const api = {
  getRepository: () => request("/repository"),
  saveRepository: (payload) =>
    request("/repository", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  scanRepository: () =>
    request("/repository/scan", {
      method: "POST",
    }),
  listCategories: () => request("/categories"),
  createCategory: (payload) =>
    request("/categories", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateCategory: (categoryId, payload) =>
    request(`/categories/${categoryId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  listArticles: (categoryName = "") =>
    request(`/categories/articles${categoryName ? `?categoryName=${encodeURIComponent(categoryName)}` : ""}`),
  getDefaultPlan: () => request("/categories/default-plan"),
  saveDefaultPlan: (payload) =>
    request("/categories/default-plan", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  listExecutors: () => request("/executors"),
  updateExecutor: (executorId, payload) =>
    request(`/executors/${executorId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  testExecutor: (executorId, payload) =>
    request(`/executors/${executorId}/test`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  listDrafts: () => request("/drafts"),
  getDraftItems: (draftId) => request(`/drafts/${draftId}/items`),
  generateDraft: (payload) =>
    request("/drafts/generate", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateDraftItem: (itemId, payload) =>
    request(`/drafts/items/${itemId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteDraftItem: (itemId) =>
    request(`/drafts/items/${itemId}`, {
      method: "DELETE",
    }),
  deleteDraft: (draftId) =>
    request(`/drafts/${draftId}`, {
      method: "DELETE",
    }),
  confirmDraft: (draftId) =>
    request(`/drafts/${draftId}/confirm`, {
      method: "POST",
    }),
  confirmDraftItems: (draftId, itemIds) =>
    request(`/drafts/${draftId}/confirm-items`, {
      method: "POST",
      body: JSON.stringify({ itemIds }),
    }),
  confirmDraftItem: (itemId) =>
    request(`/drafts/items/${itemId}/confirm`, {
      method: "POST",
    }),
  listTasks: () => request("/tasks"),
  updateTask: (taskId, payload) =>
    request(`/tasks/${taskId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteTask: (taskId) =>
    request(`/tasks/${taskId}`, {
      method: "DELETE",
    }),
  createDefaultTask: (payload = {}) =>
    request("/tasks/default", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  runTask: (taskId, payload) =>
    request(`/tasks/${taskId}/run`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  listRuns: () => request("/tasks/runs"),
};

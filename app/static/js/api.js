const JSON_HEADERS = { "content-type": "application/json" };

async function request(path, options = {}) {
  const res = await fetch(path, options);
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body && body.detail) message = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch { /* 非 JSON 错误体 */ }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const getJSON = (path) => request(path);
export const postJSON = (path, body) => request(path, {
  method: "POST",
  headers: JSON_HEADERS,
  body: JSON.stringify(body),
});
export const patchJSON = (path, body) => request(path, {
  method: "PATCH",
  headers: JSON_HEADERS,
  body: JSON.stringify(body),
});
export const del = (path) => request(path, { method: "DELETE" });

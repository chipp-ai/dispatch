/**
 * Simple API client for making authenticated requests
 */

async function request<T>(
  method: string,
  url: string,
  data?: unknown
): Promise<T> {
  const options: RequestInit = {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  };

  if (data !== undefined) {
    options.body = JSON.stringify(data);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      (errorData as { error?: string }).error ||
        `Request failed: ${response.status}`
    );
  }

  return response.json();
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, data?: unknown) => request<T>("POST", url, data),
  put: <T>(url: string, data?: unknown) => request<T>("PUT", url, data),
  patch: <T>(url: string, data?: unknown) => request<T>("PATCH", url, data),
  delete: <T>(url: string) => request<T>("DELETE", url),
};

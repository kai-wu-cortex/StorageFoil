import type { FetchLike } from './authApi';

export async function parseInventoryApiResponse<T>(response: Response): Promise<T> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('库存服务返回了非 JSON 响应。');
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('库存服务响应格式无效。');
  }

  const envelope = payload as { success?: unknown; data?: unknown; message?: unknown };
  if (envelope.success === true) {
    return envelope.data as T;
  }
  if (envelope.success === false && typeof envelope.message === 'string') {
    throw new Error(envelope.message);
  }

  throw new Error('库存服务响应格式无效。');
}

export function createInventoryApi(fetcher: FetchLike = fetch) {
  async function request<T>(url: string): Promise<T> {
    try {
      return await parseInventoryApiResponse<T>(
        await fetcher(url, { method: 'GET', credentials: 'include' }),
      );
    } catch (error) {
      if (error instanceof Error && error.message !== 'offline') {
        throw error;
      }
      throw new Error('库存服务连接失败。');
    }
  }

  return {
    bootstrap: () => request('/api/inventory/bootstrap'),
    getInventory: (options: { month: string; sourceId?: string }) => {
      const params = new URLSearchParams({ month: options.month });
      if (options.sourceId) params.set('sourceId', options.sourceId);
      return request(`/api/inventory?${params.toString()}`);
    },
  };
}

export const inventoryApi = createInventoryApi();

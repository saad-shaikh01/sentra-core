let isRefreshing = false;
let pendingQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  pendingQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token!);
    }
  });
  pendingQueue = [];
}

export function setRefreshing(value: boolean) {
  isRefreshing = value;
}

export { isRefreshing, pendingQueue, processQueue };

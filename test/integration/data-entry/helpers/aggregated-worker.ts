export const waitForAsyncWorkerDispatch = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

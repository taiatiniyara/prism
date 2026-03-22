export const waitForKpiWorkerDispatch = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

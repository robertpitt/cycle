export type CycleMessage = {
  readonly status: "done";
  readonly text: string;
};

export const createCycleMessage = (): CycleMessage => ({
  status: "done",
  text: "cycle initialised",
});

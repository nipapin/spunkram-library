/**
 * Loose evalTS typings for the CEP panel build.
 * Host implementation and strict Scripts types live in `motionflow-host`.
 */
export type Scripts = {
  [key: string]: (...args: any[]) => any;
};

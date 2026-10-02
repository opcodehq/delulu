import { useAtomValue } from "@effect/atom-react";
import { Atom } from "effect/unstable/reactivity";
import { appRegistry } from "@/shell/state/resources";

interface OnboardingState {
  readonly currentStep: number;
  readonly accountsConnected: number;
  readonly surveyAnswer: string | null;
}

interface OnboardingActions {
  readonly setCurrentStep: (step: number) => void;
  readonly nextStep: () => void;
  readonly previousStep: () => void;
  readonly setAccountsConnected: (count: number) => void;
  readonly setSurveyAnswer: (answer: string | null) => void;
  readonly reset: () => void;
}

const initialState: OnboardingState = {
  currentStep: 1,
  accountsConnected: 0,
  surveyAnswer: null,
};

const onboardingAtom = Atom.make(initialState).pipe(Atom.keepAlive);

const update = (f: (state: OnboardingState) => OnboardingState): void => {
  appRegistry.set(onboardingAtom, f(appRegistry.get(onboardingAtom)));
};

const actions: OnboardingActions = {
  setCurrentStep: (currentStep) =>
    update((state) => ({
      ...state,
      currentStep: Math.max(1, Math.min(currentStep, 5)),
    })),
  nextStep: () =>
    update((state) => ({
      ...state,
      currentStep: Math.min(state.currentStep + 1, 5),
    })),
  previousStep: () =>
    update((state) => ({
      ...state,
      currentStep: Math.max(state.currentStep - 1, 1),
    })),
  setAccountsConnected: (accountsConnected) =>
    update((state) =>
      state.accountsConnected === accountsConnected
        ? state
        : { ...state, accountsConnected }
    ),
  setSurveyAnswer: (surveyAnswer) =>
    update((state) => ({ ...state, surveyAnswer })),
  reset: () => appRegistry.set(onboardingAtom, initialState),
};

type StoreValue = OnboardingState & OnboardingActions;

export const useOnboardingStore = <T>(
  selector: (state: StoreValue) => T
): T => {
  const state = useAtomValue(onboardingAtom);
  return selector({ ...state, ...actions });
};

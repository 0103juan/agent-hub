import { PROTOCOL_ROLES } from './protocol-roles';
import { AccountProfile, ConversationSession, ModelOption, ProtocolRole, ReasoningEffort } from './types';

const EFFORT_ORDER: ReasoningEffort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

export const DEFAULT_PROFILE_ID = 'claude-main';
export const DEFAULT_MODEL_ID = 'claude-sonnet-5-5';

export function closestEffort(requested: ReasoningEffort, supported: ReasoningEffort[]): ReasoningEffort | undefined {
  if (supported.length === 0) return undefined;
  if (supported.includes(requested)) return requested;
  const target = EFFORT_ORDER.indexOf(requested);
  return [...supported].sort(
    (a, b) => Math.abs(EFFORT_ORDER.indexOf(a) - target) - Math.abs(EFFORT_ORDER.indexOf(b) - target)
  )[0];
}

export interface ModelSelection {
  account?: AccountProfile;
  model?: ModelOption;
  effort?: ReasoningEffort;
}

/** Une cuenta y modelo de la sesión con lo que existe hoy, sin mezclar proveedores. */
export function resolveSelection(
  session: Pick<ConversationSession, 'profileId' | 'modelId' | 'effort'>,
  accounts: AccountProfile[]
): ModelSelection {
  const account =
    accounts.find((a) => a.id === session.profileId) ??
    accounts.find((a) => a.status === 'connected') ??
    accounts[0];
  const model = account?.models.find((m) => m.id === session.modelId) ?? account?.models[0];
  return { account, model, effort: closestEffort(session.effort, model?.efforts ?? []) };
}

/** Modelo y esfuerzo que recomienda el rol, si la cuenta los ofrece; si no, no cambia nada. */
export function recommendedFor(role: ProtocolRole, account: AccountProfile | undefined): { modelId: string; effort?: ReasoningEffort } | undefined {
  const config = PROTOCOL_ROLES[role];
  const model = account?.models.find((m) => m.label.toLowerCase() === config.recommendedModel.toLowerCase());
  return model && { modelId: model.id, effort: closestEffort(config.recommendedEffort, model.efforts) };
}

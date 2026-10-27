import { request } from "./onboarding-api";
import { toValues, type ConditionValues, type Conditions } from "./conditions";

const PATH = "/api/onboarding/session/conditions";

export async function getConditions(): Promise<Conditions> {
  const data = await request<{ conditions: Conditions }>(PATH, { method: "GET" });
  return data.conditions;
}

/** 네 항목 모두 포함한 최종값을 보낸다(updatedAt 제외). */
export async function putConditions(values: ConditionValues): Promise<Conditions> {
  const data = await request<{ conditions: Conditions }>(PATH, {
    method: "PUT",
    headers: { "X-Onboarding-Request": "1", "Content-Type": "application/json" },
    body: JSON.stringify(toValues(values)),
  });
  return data.conditions;
}

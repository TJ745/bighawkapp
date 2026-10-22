"use server";

import { revalidatePath } from "next/cache";
import { authorizePosCapability } from "@/lib/auth/session";
import { parseInput, runAction, type ActionResult } from "@/lib/actions";
import { advanceTicket, kitchenDelta, sendToKitchen } from "@/lib/business/pos-kitchen";
import { getCurrentBranch } from "@/lib/data/platform";
import { recordAudit } from "@/lib/platform/audit";
import { advanceTicketSchema, sendToKitchenSchema } from "@/lib/validation/kitchen";

/** The kitchen. Every action is gated on the KITCHEN capability, not on the industry name. */

function revalidateKitchen() {
  revalidatePath("/pos/kitchen");
  revalidatePath("/pos/tables");
  revalidatePath("/pos/register");
}

/** Sends the rounds that have not been sent yet. Taking the order is enough to send it. */
export async function sendOrderToKitchen(input: unknown): Promise<ActionResult<{ round: number; lines: number; saleNumber: string }>> {
  return runAction(async () => {
    const auth = await authorizePosCapability("KITCHEN", "POS", "create");
    const data = parseInput(sendToKitchenSchema, input);
    const branch = await getCurrentBranch();
    const result = await sendToKitchen({
      saleId: data.saleId,
      branchId: branch.id,
      note: data.note,
      user: { id: auth.user.id, name: auth.user.name },
    });
    await recordAudit({
      auth,
      action: "pos.kitchen_sent",
      entity: "PosKitchenTicket",
      entityId: result.id,
      branchId: branch.id,
      summary: `${result.saleNumber} round ${result.round} sent to the kitchen (${result.lines} lines)`,
    });
    revalidateKitchen();
    return { round: result.round, lines: result.lines, saleNumber: result.saleNumber };
  });
}

/** Moves a ticket on: start cooking, ready, served — or cancel it. */
export async function moveTicket(input: unknown): Promise<ActionResult<{ saleNumber: string; status: string }>> {
  return runAction(async () => {
    const auth = await authorizePosCapability("KITCHEN", "POS", "edit");
    const data = parseInput(advanceTicketSchema, input);
    const branch = await getCurrentBranch();
    const result = await advanceTicket({
      ticketId: data.ticketId,
      status: data.status,
      branchId: branch.id,
      user: { id: auth.user.id, name: auth.user.name },
    });
    // Only the ends of the journey are worth an audit line; "started cooking" is not.
    if (data.status === "CANCELLED" || data.status === "SERVED") {
      await recordAudit({
        auth,
        action: data.status === "CANCELLED" ? "pos.kitchen_cancelled" : "pos.kitchen_served",
        entity: "PosKitchenTicket",
        entityId: data.ticketId,
        branchId: branch.id,
        summary: `${result.saleNumber} round ${result.round} ${data.status === "CANCELLED" ? "cancelled" : "served"}`,
      });
    }
    revalidateKitchen();
    return { saleNumber: result.saleNumber, status: result.status };
  });
}

/** What is still waiting to go to the kitchen on this order — drives the till's button. */
export async function getKitchenDelta(saleId: string): Promise<ActionResult<{ toSend: number; rounds: number }>> {
  return runAction(async () => {
    await authorizePosCapability("KITCHEN", "POS", "view");
    const delta = await kitchenDelta(saleId);
    return { toSend: delta.toSend.length, rounds: delta.rounds };
  });
}

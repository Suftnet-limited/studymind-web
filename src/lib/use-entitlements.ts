'use client';
// Shared by the Plans and Allowances screens: the learner's plan and remaining allowances, as reported by the AI backend.
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '@/services/studymind-modules.service';
import type { Entitlements } from '@/lib/studymind-validation.mjs';

export type EntitlementResponse = ({ available: true } & Entitlements) | { available: false };

async function loadEntitlements(): Promise<EntitlementResponse> {
  const response = await fetch('/api/studymind/entitlements', { cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.error || 'Unable to load your allowances', response.status);
  return body as EntitlementResponse;
}

export function useEntitlements(pollMs: number | false = false) {
  return useQuery({ queryKey: ['canonical', 'entitlements'], queryFn: loadEntitlements, retry: false, refetchInterval: pollMs });
}

export const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
/** Whole days from now until `iso` (never below 0). */
export const daysLeft = (iso: string, now = Date.now()) => Math.max(0, Math.ceil((Date.parse(iso) - now) / 86_400_000));

'use client';
import {useMutation} from '@tanstack/react-query';
import {billingService} from '@/services/billing.service';
export function useBillingCheckout(){return useMutation({mutationFn:billingService.checkout});}

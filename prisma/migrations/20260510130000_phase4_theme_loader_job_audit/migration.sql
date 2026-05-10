-- Phase 4 audit patch: theme definition loads are first-class audited jobs.

ALTER TYPE "ProviderName" ADD VALUE IF NOT EXISTS 'ALPHATREND_INTERNAL';
ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'THEME_DEFINITION_LOAD';

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

export const DashboardSkeleton: React.FC = () => {
  return (
    <div
      data-testid="dashboard-skeleton"
      aria-busy="true"
      aria-label="Loading Security Command Center"
      className="space-y-6 max-w-7xl mx-auto animate-pulse"
    >
      {/* Top Banner Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-bg-surface p-6 rounded-xl border border-border shadow-xs">
        <div className="space-y-2.5 flex-1">
          <div className="h-3.5 w-48 bg-bg-secondary rounded-md" />
          <div className="h-7 w-64 bg-bg-secondary rounded-lg" />
          <div className="h-3.5 w-80 max-w-full bg-bg-secondary rounded-md" />
        </div>

        <div className="flex items-center gap-3">
          <div className="h-10 w-36 bg-bg-secondary rounded-lg" />
          <div className="h-10 w-36 bg-primary/20 rounded-lg" />
        </div>
      </div>

      {/* KPI Metric Cards Skeleton (4-column grid) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((idx) => (
          <div
            key={idx}
            className="bg-bg-surface p-5 rounded-xl border border-border shadow-xs space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="h-3.5 w-28 bg-bg-secondary rounded" />
              <div className="h-6 w-20 bg-bg-secondary rounded-md" />
            </div>
            <div className="flex items-baseline gap-2 pt-1">
              <div className="h-9 w-20 bg-bg-secondary rounded-lg" />
              <div className="h-3 w-16 bg-bg-secondary rounded" />
            </div>
            <div className="pt-3 border-t border-border flex items-center justify-between">
              <div className="h-3 w-24 bg-bg-secondary rounded" />
              <div className="h-3.5 w-3.5 bg-bg-secondary rounded" />
            </div>
          </div>
        ))}
      </div>

      {/* Main Content Grid Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Items List Skeleton */}
        <div className="lg:col-span-2 bg-bg-surface rounded-xl border border-border shadow-xs overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div className="h-4 w-52 bg-bg-secondary rounded" />
            <div className="h-3.5 w-14 bg-bg-secondary rounded" />
          </div>

          <div className="divide-y divide-border">
            {[0, 1, 2, 3, 4].map((row) => (
              <div
                key={row}
                className="px-6 py-4 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3.5 flex-1">
                  <div className="w-10 h-10 rounded-lg bg-bg-secondary shrink-0" />
                  <div className="space-y-2 flex-1 max-w-xs">
                    <div className="h-4 w-3/4 bg-bg-secondary rounded" />
                    <div className="h-3 w-1/2 bg-bg-secondary rounded" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="hidden sm:block h-5 w-20 bg-bg-secondary rounded-md" />
                  <div className="h-3.5 w-16 bg-bg-secondary rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cryptographic Posture Card Skeleton */}
        <div className="bg-[#03152F] rounded-xl p-6 flex flex-col justify-between border border-[#1D3855] shadow-xs space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="h-3 w-32 bg-[#0B1F38] rounded" />
              <div className="h-5 w-16 bg-[#0B1F38] rounded" />
            </div>
            <div className="h-6 w-56 bg-[#0B1F38] rounded" />

            <div className="space-y-3 pt-2">
              {[0, 1, 2, 3].map((line) => (
                <div
                  key={line}
                  className="flex items-center justify-between py-2 border-b border-[#1D3855]"
                >
                  <div className="h-3 w-24 bg-[#0B1F38] rounded" />
                  <div className="h-3 w-28 bg-[#0B1F38] rounded" />
                </div>
              ))}
            </div>
          </div>

          <div className="h-10 w-full bg-[#062A63] rounded-lg" />
        </div>
      </div>
    </div>
  );
};

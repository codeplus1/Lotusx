/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VaultRecord, SecurityScoreReport, PasswordAuditIssue } from '../types/vault';
import { passwordGeneratorService } from './PasswordGeneratorService';

export class PasswordHealthService {
  public static readonly ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
  public static readonly NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

  /**
   * Scans all decrypted vault records and calculates a comprehensive security health report
   */
  auditVault(records: VaultRecord[], currentTimestamp: number = Date.now()): SecurityScoreReport {
    const activeRecords = records.filter((r) => !r.deletedAt);
    const issues: PasswordAuditIssue[] = [];
    const passwordMap = new Map<string, string[]>();
    const websiteMap = new Map<string, string[]>();
    const now = currentTimestamp;

    let totalPasswords = 0;
    let weakCount = 0;
    let reusedCount = 0;
    let oldCount = 0;
    let missingCount = 0;
    let strongCount = 0;

    const weakPasswords: VaultRecord[] = [];
    const reusedPasswords: VaultRecord[] = [];
    const oldPasswords: VaultRecord[] = [];
    const overOneYearIssues: PasswordAuditIssue[] = [];

    for (const record of activeRecords) {
      const recType = record.type || 'login';
      if (recType === 'login' || recType === 'wifi' || recType === 'pin' || record.password) {
        const password = record.password || record.pin || '';

        if (!password) {
          if (recType === 'login' || recType === 'wifi' || recType === 'pin') {
            missingCount++;
            const desc = 'Credential is missing a password or PIN.';
            issues.push({
              recordId: record.id,
              title: record.title,
              recordTitle: record.title,
              username: record.username,
              issueType: 'missing',
              type: 'missing',
              severity: 'high',
              description: desc,
              message: desc,
            });
          }
          continue;
        }

        totalPasswords++;

        // 1. Check Weakness
        const strength = passwordGeneratorService.evaluateStrength(password);
        if (strength.score < 3 || password.length < 12) {
          weakCount++;
          weakPasswords.push(record);
          const desc = `Weak password (${strength.label}, ${strength.entropyBits} bits of entropy). Minimum recommended length is 12 characters.`;
          issues.push({
            recordId: record.id,
            title: record.title,
            recordTitle: record.title,
            username: record.username,
            issueType: 'weak',
            type: 'weak',
            severity: 'high',
            description: desc,
            message: desc,
          });
        } else {
          strongCount++;
        }

        // 2. Track for Reuse detection
        const existing = passwordMap.get(password) || [];
        existing.push(record.title);
        passwordMap.set(password, existing);

        // 3. Check Password Age (> 1 year / 365 days)
        const ageMs = now - (record.updatedAt || record.createdAt);
        const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
        if (ageMs > PasswordHealthService.ONE_YEAR_MS) {
          oldCount++;
          oldPasswords.push(record);
          const desc = `Password hasn't been updated in ${ageDays} days (over 1 year). Consider rotating to minimize credential exposure.`;
          const oldIssue: PasswordAuditIssue = {
            recordId: record.id,
            title: record.title,
            recordTitle: record.title,
            username: record.username,
            issueType: 'old',
            type: 'old',
            severity: 'medium',
            description: desc,
            message: desc,
            passwordAgeDays: ageDays,
          };
          issues.push(oldIssue);
          overOneYearIssues.push(oldIssue);
        }

        // 4. Track Website Duplicates
        const siteUrl = record.website || record.url;
        if (siteUrl) {
          try {
            const url = new URL(
              siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`
            );
            const domain = url.hostname.replace(/^www\./, '');
            const domExisting = websiteMap.get(domain) || [];
            domExisting.push(record.title);
            websiteMap.set(domain, domExisting);
          } catch {
            // invalid URL format handled elsewhere
          }
        }
      }
    }

    // Identify reused passwords across entries
    for (const record of activeRecords) {
      const password = record.password || record.pin || '';
      if (password && (passwordMap.get(password)?.length || 0) > 1) {
        reusedCount++;
        reusedPasswords.push(record);
        const sharedWith = (passwordMap.get(password) || [])
          .filter((t) => t !== record.title)
          .join(', ');
        if (!issues.some((i) => i.recordId === record.id && i.issueType === 'reused')) {
          const desc = `Shared password with: ${sharedWith}. Reusing passwords across accounts allows a breach on one site to compromise others.`;
          issues.push({
            recordId: record.id,
            title: record.title,
            recordTitle: record.title,
            username: record.username,
            issueType: 'reused',
            type: 'reused',
            severity: 'high',
            description: desc,
            message: desc,
          });
        }
      }
    }

    // Identify duplicate accounts on the same domain
    websiteMap.forEach((titles, domain) => {
      if (titles.length > 1) {
        for (const title of titles) {
          const rec = activeRecords.find((r) => r.title === title);
          if (rec && !issues.some((i) => i.recordId === rec.id && i.issueType === 'duplicate_url')) {
            const desc = `Multiple logins configured for ${domain} (${titles.join(', ')}).`;
            issues.push({
              recordId: rec.id,
              title: rec.title,
              recordTitle: rec.title,
              username: rec.username,
              issueType: 'duplicate_url',
              type: 'duplicate_url',
              severity: 'low',
              description: desc,
              message: desc,
            });
          }
        }
      }
    });

    // Calculate score (100 is perfect)
    let score = 100;
    if (totalPasswords === 0) {
      score = 100;
    } else {
      score -= weakCount * 25;
      score -= reusedCount * 20;
      score -= missingCount * 30;
      score -= oldCount * 5;
    }
    score = Math.max(0, Math.min(100, Math.round(score)));

    return {
      score,
      overallScore: score,
      totalPasswords,
      weakCount,
      reusedCount,
      oldCount,
      missingCount,
      strongCount,
      issues,
      weakPasswords,
      reusedPasswords,
      oldPasswords,
      overOneYearCount: overOneYearIssues.length,
      overOneYearIssues,
    };
  }
}

export const passwordHealthService = new PasswordHealthService();

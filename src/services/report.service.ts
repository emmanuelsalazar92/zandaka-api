import { ExchangeRateRepository } from '../repositories/exchange-rate.repo';
import { ReportRepository } from '../repositories/report.repo';
import {
  AccountBalance,
  CategoryTotal,
  EnvelopeBalance,
  EnvelopeCurrencyTotal,
  GenerateReportSnapshotInput,
  Inconsistency,
  MonthlyExpense,
  NegativeEnvelope,
  ReportSnapshotDocument,
  ReportSnapshotRecord,
  ReportSnapshotSummary,
} from '../repositories/report.repo';
import { UserRepository } from '../repositories/user.repo';
import { buildReportPdfHtml } from '../templates/report-pdf.template';
import { LogoAssetService } from '../utils/logo.util';
import { PdfRenderer } from '../utils/pdf.util';
import { ExchangeRateService } from './exchange-rate.service';
import { PayrollRuleService } from './payroll-rule.service';

type ResolvedSnapshotRates = {
  exchangeRateId: number | null;
  exchangeRateUsed: number | null;
};

type StoredMonthEndRates = {
  usdToCrcRateId: number | null;
  usdToCrcRate: number | null;
  crcToUsdRateId: number | null;
  crcToUsdRate: number | null;
};

export class ReportService {
  private repo = new ReportRepository();
  private userRepo = new UserRepository();
  private exchangeRateRepo = new ExchangeRateRepository();
  private exchangeRateService = new ExchangeRateService();
  private payrollRuleService = new PayrollRuleService();
  private logoAssetService = new LogoAssetService();
  private pdfRenderer = new PdfRenderer();

  getAccountBalances(isActive?: boolean): AccountBalance[] {
    return this.repo.getAccountBalances(isActive);
  }

  getEnvelopeBalances(accountId: number): EnvelopeBalance[] {
    return this.repo.getEnvelopeBalances(accountId);
  }

  getNegativeEnvelopes(): NegativeEnvelope[] {
    return this.repo.getNegativeEnvelopes();
  }

  getMonthlyExpenses(month: string): MonthlyExpense[] {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw { code: 'VALIDATION_ERROR', message: 'Month must be in YYYY-MM format' };
    }

    return this.repo.getMonthlyExpenses(month);
  }

  getCategoryTotals(): CategoryTotal[] {
    return this.repo.getCategoryTotals();
  }

  getEnvelopeTotalByCurrency(currency: string): EnvelopeCurrencyTotal {
    if (!currency.trim()) {
      throw { code: 'VALIDATION_ERROR', message: 'currency query parameter is required' };
    }

    return this.repo.getEnvelopeTotalByCurrency(currency);
  }

  getInconsistencies(accountId?: number): Inconsistency[] {
    return this.repo.getInconsistencies(accountId);
  }

  getActiveAccountInconsistencies(): Inconsistency[] {
    return this.repo.getActiveAccountInconsistencies();
  }

  listSnapshots(userId: number, includeArchived = false): ReportSnapshotRecord[] {
    const user = this.userRepo.findById(userId);
    if (!user) {
      throw { code: 'NOT_FOUND', message: `User ${userId} not found` };
    }

    return this.repo.listSnapshotsByUser(userId, includeArchived);
  }

  archiveSnapshot(snapshotId: number, userId: number): ReportSnapshotRecord {
    const user = this.userRepo.findById(userId);
    if (!user) {
      throw { code: 'NOT_FOUND', message: `User ${userId} not found` };
    }

    const snapshot = this.repo.findSnapshotById(snapshotId);
    if (!snapshot || snapshot.user_id !== userId) {
      throw { code: 'NOT_FOUND', message: `Report snapshot ${snapshotId} not found` };
    }

    return this.repo.archiveSnapshotById(snapshotId) as ReportSnapshotRecord;
  }

  getSnapshotById(snapshotId: number): ReportSnapshotRecord {
    const snapshot = this.repo.findSnapshotById(snapshotId);
    if (!snapshot) {
      throw { code: 'NOT_FOUND', message: `Report snapshot ${snapshotId} not found` };
    }

    return snapshot;
  }

  async generateSnapshotPdf(snapshotId: number): Promise<{ fileName: string; pdf: Buffer }> {
    const document = this.repo.findSnapshotDocumentById(snapshotId);
    if (!document) {
      throw { code: 'NOT_FOUND', message: `Report snapshot ${snapshotId} not found` };
    }

    const logoDataUri = this.logoAssetService.getLogoDataUri();
    const html = buildReportPdfHtml(document, logoDataUri);
    const footerLabel = this.buildPdfFooterLabel(document);
    const pdf = await this.pdfRenderer.renderHtmlToPdf(html, footerLabel);

    return {
      fileName: this.buildSnapshotPdfFileName(document),
      pdf,
    };
  }

  async generateSnapshot(input: {
    user_id: number;
    report_month: string;
    base_currency?: string;
    exchange_rate_id?: number;
    usd_to_crc_rate?: number;
    ccss_rule_set_id?: number;
    income_tax_rule_set_id?: number;
    notes?: string;
  }): Promise<ReportSnapshotSummary> {
    const user = this.userRepo.findById(input.user_id);
    if (!user) {
      throw { code: 'NOT_FOUND', message: `User ${input.user_id} not found` };
    }

    if (!/^\d{4}-\d{2}$/.test(input.report_month)) {
      throw { code: 'VALIDATION_ERROR', message: 'report_month must be in YYYY-MM format' };
    }

    const baseCurrency = user.base_currency.toUpperCase();
    if (!['CRC', 'USD'].includes(baseCurrency)) {
      throw { code: 'VALIDATION_ERROR', message: 'base_currency must be CRC or USD' };
    }

    if (input.base_currency && input.base_currency.toUpperCase() !== baseCurrency) {
      throw {
        code: 'VALIDATION_ERROR',
        message: `base_currency must match the user's base currency (${baseCurrency})`,
      };
    }

    const resolvedRate = await this.resolveSnapshotRates({
      userId: input.user_id,
      reportMonth: input.report_month,
      baseCurrency: baseCurrency as 'CRC' | 'USD',
      exchangeRateId: input.exchange_rate_id ?? null,
      usdToCrcRate: input.usd_to_crc_rate ?? null,
    });
    this.validateOptionalPayrollRuleRefs(input.user_id, {
      ccssRuleSetId: input.ccss_rule_set_id,
      incomeTaxRuleSetId: input.income_tax_rule_set_id,
    });

    const payload: GenerateReportSnapshotInput = {
      userId: input.user_id,
      reportMonth: input.report_month,
      baseCurrency: baseCurrency as 'CRC' | 'USD',
      exchangeRateId: resolvedRate.exchangeRateId,
      exchangeRateUsed: resolvedRate.exchangeRateUsed,
      ccssRuleSetId: input.ccss_rule_set_id ?? null,
      incomeTaxRuleSetId: input.income_tax_rule_set_id ?? null,
      notes: input.notes?.trim() || null,
    };

    return this.repo.generateSnapshot(payload);
  }

  private async resolveSnapshotRates(params: {
    userId: number;
    reportMonth: string;
    baseCurrency: 'CRC' | 'USD';
    exchangeRateId: number | null;
    usdToCrcRate: number | null;
  }): Promise<ResolvedSnapshotRates> {
    if (params.exchangeRateId !== null) {
      const exchangeRate = this.exchangeRateRepo.findById(params.exchangeRateId);
      if (!exchangeRate || exchangeRate.user_id !== params.userId) {
        throw {
          code: 'NOT_FOUND',
          message: `Exchange rate ${params.exchangeRateId} not found`,
        };
      }

      const fromCurrency = exchangeRate.from_currency.toUpperCase();
      const toCurrency = exchangeRate.to_currency.toUpperCase();
      const pairedRates = await this.ensureStoredMonthEndRates(params.userId, exchangeRate.effective_date);

      if (fromCurrency === 'USD' && toCurrency === 'CRC') {
        return {
          exchangeRateId:
            params.baseCurrency === 'CRC' ? exchangeRate.id : pairedRates?.crcToUsdRateId ?? null,
          exchangeRateUsed:
            params.baseCurrency === 'CRC' ? exchangeRate.rate : pairedRates?.crcToUsdRate ?? null,
        };
      }

      if (fromCurrency === 'CRC' && toCurrency === 'USD') {
        return {
          exchangeRateId:
            params.baseCurrency === 'USD' ? exchangeRate.id : pairedRates?.usdToCrcRateId ?? null,
          exchangeRateUsed:
            params.baseCurrency === 'USD' ? exchangeRate.rate : pairedRates?.usdToCrcRate ?? null,
        };
      }

      throw {
        code: 'VALIDATION_ERROR',
        message: 'exchange_rate_id must reference a USD/CRC or CRC/USD exchange rate',
      };
    }

    if (params.usdToCrcRate !== null) {
      if (params.usdToCrcRate <= 0) {
        throw {
          code: 'VALIDATION_ERROR',
          message: 'usd_to_crc_rate must be greater than 0',
        };
      }

      return {
        exchangeRateId: null,
        exchangeRateUsed: params.baseCurrency === 'CRC' ? params.usdToCrcRate : null,
      };
    }

    const storedOrFetchedRate = await this.findOrCreateStoredUsdToCrcRate(
      params.userId,
      params.reportMonth,
      params.baseCurrency,
    );
    if (storedOrFetchedRate) {
      return storedOrFetchedRate;
    }

    return {
      exchangeRateId: null,
      exchangeRateUsed: null,
    };
  }

  private async findOrCreateStoredUsdToCrcRate(
    userId: number,
    reportMonth: string,
    baseCurrency: 'CRC' | 'USD',
  ): Promise<ResolvedSnapshotRates | null> {
    const effectiveDate = this.getMonthEndDate(reportMonth);
    const storedRates = await this.ensureStoredMonthEndRates(userId, effectiveDate);

    if (storedRates && storedRates.usdToCrcRate !== null) {
      return {
        exchangeRateId:
          baseCurrency === 'CRC' ? storedRates.usdToCrcRateId : storedRates.crcToUsdRateId,
        exchangeRateUsed:
          baseCurrency === 'CRC' ? storedRates.usdToCrcRate : storedRates.crcToUsdRate,
      };
    }

    return null;
  }

  private async ensureStoredMonthEndRates(
    userId: number,
    effectiveDate: string,
  ): Promise<StoredMonthEndRates | null> {
    const existingUsdToCrc = this.exchangeRateRepo.list({
      userId,
      fromCurrency: 'USD',
      toCurrency: 'CRC',
      effectiveDate,
    })[0];
    const existingCrcToUsd = this.exchangeRateRepo.list({
      userId,
      fromCurrency: 'CRC',
      toCurrency: 'USD',
      effectiveDate,
    })[0];

    if (existingUsdToCrc && existingCrcToUsd) {
      return {
        usdToCrcRateId: existingUsdToCrc.id,
        usdToCrcRate: existingUsdToCrc.rate,
        crcToUsdRateId: existingCrcToUsd.id,
        crcToUsdRate: existingCrcToUsd.rate,
      };
    }

    try {
      const [year, month, day] = effectiveDate.split('-').map(Number);
      const apiRate = await this.exchangeRateService.getByDate(day, month, year);

      const usdToCrc =
        existingUsdToCrc ??
        this.exchangeRateService.create({
          userId,
          fromCurrency: 'USD',
          toCurrency: 'CRC',
          rate: apiRate.compra,
          effectiveDate,
        });

      const crcToUsd =
        existingCrcToUsd ??
        this.exchangeRateService.create({
          userId,
          fromCurrency: 'CRC',
          toCurrency: 'USD',
          rate: apiRate.venta,
          effectiveDate,
        });

      return {
        usdToCrcRateId: usdToCrc.id,
        usdToCrcRate: usdToCrc.rate,
        crcToUsdRateId: crcToUsd.id,
        crcToUsdRate: crcToUsd.rate,
      };
    } catch {
      if (existingUsdToCrc || existingCrcToUsd) {
        return {
          usdToCrcRateId: existingUsdToCrc?.id ?? null,
          usdToCrcRate: existingUsdToCrc?.rate ?? null,
          crcToUsdRateId: existingCrcToUsd?.id ?? null,
          crcToUsdRate: existingCrcToUsd?.rate ?? null,
        };
      }

      return null;
    }
  }

  private getMonthEndDate(reportMonth: string): string {
    const [year, month] = reportMonth.split('-').map(Number);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return `${reportMonth}-${String(lastDay).padStart(2, '0')}`;
  }

  private validateOptionalPayrollRuleRefs(
    userId: number,
    refs: { ccssRuleSetId?: number; incomeTaxRuleSetId?: number },
  ) {
    if (refs.ccssRuleSetId) {
      this.payrollRuleService.assertRuleSetReference(userId, refs.ccssRuleSetId, 'CCSS_WORKER');
    }

    if (refs.incomeTaxRuleSetId) {
      this.payrollRuleService.assertRuleSetReference(userId, refs.incomeTaxRuleSetId, 'INCOME_TAX');
    }
  }

  private buildSnapshotPdfFileName(document: ReportSnapshotDocument): string {
    return `zandaka-report-${document.snapshot.report_month}-v${document.snapshot.version}.pdf`;
  }

  private buildPdfFooterLabel(document: ReportSnapshotDocument): string {
    return `Generated by Zandaka | ${document.snapshot.report_month} | v${document.snapshot.version}`;
  }
}




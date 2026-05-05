const express = require('express');
const ExcelJS = require('exceljs');
const router = express.Router();
const {
  listContracts,
  getFilterOptions,
} = require('../services/contractService');
const { listContractSeries } = require('../services/contractSeriesService');

const STATUS_LABELS = {
  'VIGENTE': 'Vigente',
  'VENCIDO': 'Vencido',
  'CANCELADO': 'Cancelado',
};

const CURRENCY_NUM_FORMAT = '"$"#,##0.00';

router.get('/', async (req, res, next) => {
  try {
    const result = await listContracts(req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/filters', async (req, res, next) => {
  try {
    const options = await getFilterOptions(req.query);
    res.json(options);
  } catch (err) {
    next(err);
  }
});

router.get('/series', async (req, res, next) => {
  try {
    const result = await listContractSeries(req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/series/export', async (req, res, next) => {
  try {
    const data = await listContractSeries({ ...req.query, page: 1, limit: 10000 });
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Series');

    sheet.columns = [
      { header: 'SEGMENTO', key: 'segment', width: 20 },
      { header: 'Z/Cobros', key: 'billing_zone', width: 16 },
      { header: 'Precios', key: 'price_mode', width: 16 },
      { header: 'CLIENTE', key: 'client_code', width: 18 },
      { header: 'RAZON SOCIAL', key: 'client', width: 32 },
      { header: 'CONTRATO', key: 'contract_name', width: 20 },
      { header: 'T/CONTRATO', key: 'contract_type', width: 16 },
      { header: 'FREC', key: 'frequency', width: 14 },
      { header: 'DURAC', key: 'duration_months', width: 12 },
      { header: 'F/INICIAL', key: 'start_date', width: 18 },
      { header: 'F/FINAL', key: 'end_date', width: 18 },
      { header: 'SERIE', key: 'equipment_series', width: 20 },
      { header: 'MODELO', key: 'model', width: 18 },
      { header: 'PRODUCTO', key: 'product', width: 18 },
      { header: 'ACCESORIO', key: 'accessory', width: 14 },
      { header: 'COP MINIMO', key: 'min_copies', width: 16 },
      { header: 'COP MIN COLOR', key: 'min_color_copies', width: 16 },
      { header: 'CARGO FIJO', key: 'charge_fixed', width: 16 },
      { header: 'CUOTA BOX', key: 'box_fee', width: 16 },
      { header: 'CUOTA SERV', key: 'service_fee', width: 16 },
      { header: 'COP PROMED', key: 'average_copies', width: 16 },
      { header: 'TIPO ESCALA', key: 'scale_type', width: 16 },
      { header: 'NUM ESCALA', key: 'scale_number', width: 14 },
      { header: 'COPIADO DESDE', key: 'scale_from', width: 16 },
      { header: 'COPIADO HASTA', key: 'scale_to', width: 16 },
      { header: 'PRECIO POR COPIA', key: 'scale_price_per_copy', width: 18 },
      { header: 'LITERAL FACTURAS', key: 'invoice_literal', width: 26 },
      { header: 'DIRECCION', key: 'installation_address', width: 36 },
      { header: 'TELEFONO 1', key: 'phone1', width: 16 },
      { header: 'TELEFONO 2', key: 'phone2', width: 16 },
      { header: 'RESPONSABLE', key: 'commercial_owner', width: 28 },
    ];

    sheet.getRow(1).font = { bold: true };
    applyCurrencyColumnFormats(sheet, ['charge_fixed', 'box_fee', 'service_fee', 'scale_price_per_copy']);

    for (const row of data.data) {
      sheet.addRow({
        segment: row.segment || '',
        billing_zone: row.billing_zone || '',
        price_mode: row.price_mode || '',
        client_code: row.client_code || '',
        client: row.client || '',
        contract_name: row.contract_name || '',
        contract_type: row.contract_type || '',
        frequency: row.frequency || '',
        duration_months: row.duration_months ?? '',
        start_date: row.start_date || '',
        end_date: row.end_date || '',
        equipment_series: row.equipment_series || '',
        model: row.model || '',
        product: row.product || '',
        accessory: row.accessory || '',
        min_copies: row.min_copies != null ? parseFloat(row.min_copies) : null,
        min_color_copies: row.min_color_copies != null ? parseFloat(row.min_color_copies) : null,
        charge_fixed: row.charge_fixed != null ? parseFloat(row.charge_fixed) : null,
        box_fee: row.box_fee != null ? parseFloat(row.box_fee) : null,
        service_fee: row.service_fee != null ? parseFloat(row.service_fee) : null,
        average_copies: row.average_copies != null ? parseFloat(row.average_copies) : null,
        scale_type: row.scale_type || '',
        scale_number: row.scale_number ?? '',
        scale_from: row.scale_from != null ? parseFloat(row.scale_from) : null,
        scale_to: row.scale_to != null ? parseFloat(row.scale_to) : null,
        scale_price_per_copy: row.scale_price_per_copy != null ? parseFloat(row.scale_price_per_copy) : null,
        invoice_literal: row.invoice_literal || '',
        installation_address: row.installation_address || '',
        phone1: row.phone1 || '',
        phone2: row.phone2 || '',
        commercial_owner: row.commercial_owner || '',
      });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="contractflow-series-${Date.now()}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
});

router.get('/export', async (req, res, next) => {
  try {
    const data = await listContracts({ ...req.query, page: 1, limit: 10000 });
    const isSqlVigentesTable = ['vigentes', 'upcoming'].includes(String(data.table || '').toLowerCase());

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Contratos');

    sheet.columns = isSqlVigentesTable
      ? [
          { header: 'CLIENTE', key: 'client_code', width: 18 },
          { header: 'RAZON SOCIAL', key: 'client', width: 32 },
          { header: 'CONTRATO', key: 'contract_name', width: 20 },
          { header: 'TIPO', key: 'contract_type', width: 14 },
          { header: 'DURACION', key: 'duration_months', width: 14 },
          { header: 'FECHA INICIO', key: 'start_date', width: 18 },
          { header: 'FECHA FINAL', key: 'end_date', width: 18 },
          { header: 'RESPONSABLE', key: 'commercial_owner', width: 28 },
          { header: 'CARGO FIJO', key: 'charge_fixed', width: 16 },
          { header: 'CUOTA BOX', key: 'box_fee', width: 16 },
          { header: 'CUOTA SERV', key: 'service_fee', width: 16 },
        ]
      : [
          { header: 'Cliente', key: 'client', width: 30 },
          { header: 'Contrato', key: 'contract_name', width: 30 },
          { header: 'Tipo', key: 'contract_type', width: 25 },
          { header: 'Pl_Cem_Empleado', key: 'commercial_owner_code', width: 18 },
          { header: 'Responsable', key: 'commercial_owner', width: 25 },
          { header: 'Negocio', key: 'business_div_name', width: 26 },
          { header: 'Fuente', key: 'source_type', width: 14 },
          { header: 'Fecha de inicio', key: 'start_date', width: 18 },
          { header: 'Fecha de fin', key: 'end_date', width: 18 },
          { header: 'Fecha de cancelación', key: 'cancellation_date', width: 18 },
          { header: 'Estado origen', key: 'source_status', width: 18 },
          { header: 'Estado normalizado', key: 'status', width: 18 },
          { header: 'Motivo', key: 'cancellation_reason', width: 24 },
          { header: 'Ingreso mensual', key: 'monthly_revenue', width: 18 },
          { header: 'Total anual', key: 'annual_total', width: 18 },
          { header: 'Rentabilidad (%)', key: 'profitability', width: 18 },
          { header: 'Puntaje de riesgo', key: 'risk_score', width: 18 },
        ];

    sheet.getRow(1).font = { bold: true };
    applyCurrencyColumnFormats(
      sheet,
      isSqlVigentesTable
        ? ['charge_fixed', 'box_fee', 'service_fee']
        : ['monthly_revenue', 'annual_total']
    );

    for (const c of data.data) {
      sheet.addRow(isSqlVigentesTable ? {
        client_code: c.client_code || '',
        client: c.client,
        contract_name: c.contract_name || '',
        contract_type: c.contract_type,
        duration_months: c.duration_months ?? '',
        start_date: c.start_date || '',
        end_date: c.end_date || '',
        commercial_owner: c.commercial_owner || '',
        charge_fixed: c.charge_fixed != null ? parseFloat(c.charge_fixed) : null,
        box_fee: c.box_fee != null ? parseFloat(c.box_fee) : null,
        service_fee: c.service_fee != null ? parseFloat(c.service_fee) : null,
      } : {
        client: c.client,
        contract_name: c.contract_name || '',
        contract_type: c.contract_type,
        commercial_owner_code: c.commercial_owner_code || '',
        commercial_owner: c.commercial_owner || '',
        business_div_name: c.business_div_name || '',
        source_type: c.source_type === 'vigente' ? 'Vigente' : 'Vencido',
        start_date: c.start_date || '',
        end_date: c.end_date || '',
        cancellation_date: c.cancellation_date || '',
        source_status: c.source_status || '',
        status: STATUS_LABELS[c.display_status || c.canonical_status] || c.display_status || c.canonical_status,
        cancellation_reason: c.cancellation_reason || '',
        monthly_revenue: c.monthly_revenue != null ? parseFloat(c.monthly_revenue) : null,
        annual_total: c.annual_total != null ? parseFloat(c.annual_total) : null,
        profitability: c.profitability != null ? parseFloat(c.profitability) : null,
        risk_score: c.risk_score != null ? parseFloat(c.risk_score) : null,
      });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="contractflow-contratos-${Date.now()}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
});

function applyCurrencyColumnFormats(sheet, keys = []) {
  for (const key of keys) {
    sheet.getColumn(key).numFmt = CURRENCY_NUM_FORMAT;
  }
}

module.exports = router;

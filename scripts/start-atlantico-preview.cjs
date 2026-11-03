// Local-only UI review using an isolated synthetic DB. Does not open any production database.
const os = require('node:os');
const path = require('node:path');
const { createSyntheticDb } = require('../tests/helpers/synthetic-db');

const file = path.join(os.tmpdir(), 'zandaka-atlantico-preview-' + Date.now() + '.db');
createSyntheticDb(file);
process.env.DB_PATH = file;
const { db } = require('../src/db/db');
const { ExchangeRateService } = require('../src/services/exchange-rate.service');
ExchangeRateService.prototype.getByDate = async () => ({
  compra: 500,
  venta: 510,
  fecha: '02/11/2026',
});
const { createApp } = require('../src/app');
const { ReportRepository } = require('../src/repositories/report.repo');

db.exec(`
  INSERT INTO user (id,name,base_currency) VALUES (1,'Demostración Atlántico','CRC');
  INSERT INTO institution (id,user_id,name,type) VALUES (1,1,'Banco de ejemplo','BANK');
  INSERT INTO account (id,user_id,institution_id,name,currency) VALUES
    (1,1,1,'Cuenta principal','CRC'),(2,1,1,'Ahorro','CRC'),(3,1,1,'Cuenta en dólares','USD');
  INSERT INTO category (id,user_id,name,parent_id) VALUES
    (1,1,'Personal',NULL),(2,1,'Uso personal',1),(3,1,'Ahorro',1),(4,1,'Servicios',1);
  INSERT INTO account_envelope (id,account_id,category_id) VALUES
    (1,1,2),(2,1,3),(3,2,3),(4,3,3),(5,1,4);
  INSERT INTO transactions (id,user_id,date,description,type) VALUES
    (1,1,'2026-11-01','Saldo inicial · ejemplo','INCOME'),
    (2,1,'2026-11-02','Compra de ejemplo','EXPENSE');
  INSERT INTO transaction_line (id,transaction_id,account_id,envelope_id,amount) VALUES
    (1,1,1,1,1205000),(2,1,1,2,6000000),(3,1,2,3,5000000),(4,1,3,4,2500),
    (5,1,1,5,250000),(6,2,1,1,-5000);
`);
new ReportRepository().generateSnapshot({
  userId: 1,
  reportMonth: '2026-11',
  baseCurrency: 'CRC',
  exchangeRateId: null,
  exchangeRateUsed: 500,
  ccssRuleSetId: null,
  incomeTaxRuleSetId: null,
  notes: 'Demostración con datos ficticios. No corresponde a una cuenta real.',
});

const server = createApp().listen(3210, '127.0.0.1', () => {
  console.log('Synthetic API: http://127.0.0.1:3210');
});
const close = () =>
  server.close(() => {
    db.close();
    process.exit(0);
  });
process.on('SIGINT', close);
process.on('SIGTERM', close);

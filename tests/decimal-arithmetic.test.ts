import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertMoney,
  convertMoney,
  currencyDigits,
  decimalNumber,
  roundMoney,
  subtractMoney,
  sumMoney,
  amountFromPercentage,
} from '../src/utils/money';

test('exact addition, thousands of movements, negatives and cancellation', () => {
  assert.equal(sumMoney([0.1, 0.2]), 0.3);
  assert.equal(sumMoney(Array.from({ length: 10000 }, () => 0.01)), 100);
  assert.equal(subtractMoney(0.3, 0.1, 0.2), 0);
  assert.equal(sumMoney([-0.1, -0.2]), -0.3);
  assert.equal(Object.is(sumMoney([-0.1, 0.1]), -0), false);
});

test('exact sums retain cents across long synthetic ledgers', () => {
  for (const expected of [121734.27, 0, 16814.14]) {
    const movements = [expected, ...Array.from({ length: 1000 }, () => 0.01), -10];
    assert.equal(sumMoney(movements), expected);
    assert.notEqual(
      movements.reduce((total, amount) => total + amount, 0),
      expected,
    );
  }
  assert.throws(() => assertMoney(9.094947017729282e-13, 'CRC'));
  assert.throws(() => assertMoney(121734.26999999997, 'CRC'));
});

test('currency scale and symmetric half-up settlement, independent from rates', () => {
  assert.equal(currencyDigits('JPY'), 0);
  assert.equal(currencyDigits('BHD'), 3);
  assert.equal(currencyDigits('CLF'), 4);
  assert.equal(assertMoney('1.234', 'BHD'), 1.234);
  assert.throws(() => assertMoney('1.1', 'JPY'));
  assert.throws(() => assertMoney('1.234', 'USD'));
  assert.equal(roundMoney('1.005', 'USD'), 1.01);
  assert.equal(roundMoney('-1.005', 'USD'), -1.01);
  assert.equal(convertMoney('0.01', '500.123456', 'CRC'), 5);
  assert.equal(convertMoney('75000', '520', 'USD', true), 144.23);
  assert.equal(convertMoney('1', '1.2345', 'BHD'), 1.235);
  assert.equal(amountFromPercentage(0.3, 50, 'USD'), 0.15);
  assert.throws(() => convertMoney(1, 0, 'USD'));
});

test('safe numeric API bounds reject loss instead of truncating decimals', () => {
  assert.equal(assertMoney('90071992547409.9', 'USD'), 90071992547409.9);
  assert.throws(() => assertMoney('90071992547409.91', 'USD'));
  assert.throws(() => assertMoney('90071992547409.92', 'USD'));
  assert.throws(() => decimalNumber('9007199254740993'));
  assert.equal(JSON.parse(JSON.stringify({ amount: sumMoney([0.1, 0.2]) })).amount, 0.3);
});

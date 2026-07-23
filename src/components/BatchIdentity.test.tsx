import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import BatchIdentity from './BatchIdentity';

test('product model and batch code use the same visual value style', () => {
  const html = renderToStaticMarkup(
    <BatchIdentity
      productModel="PC-003M（哑银）"
      batchCode="260427-01"
      valueClassName="font-mono text-base font-bold text-slate-800"
    />,
  );

  assert.match(html, /产品型号/);
  assert.match(html, /PC-003M（哑银）/);
  assert.match(html, /产品批次/);
  assert.match(html, /260427-01/);

  const valueClassMatches = [
    ...html.matchAll(/data-batch-identity-value="(?:model|batch)" class="([^"]+)"/g),
  ].map(match => match[1]);
  assert.equal(valueClassMatches.length, 2);
  assert.equal(valueClassMatches[0], valueClassMatches[1]);
});

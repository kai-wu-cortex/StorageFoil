import type { WpsFieldConfig } from '../types';

export const DEFAULT_WPS_FIELD_CONFIG: WpsFieldConfig[] = [
  { fieldId: 'productModel', displayName: '产品型号', mappedColumn: '产品型号', required: true },
  { fieldId: 'batchCode', displayName: '产品批次', mappedColumn: '产品批次', required: true },
  { fieldId: 'specification', displayName: '规格', mappedColumn: '规格' },
  { fieldId: 'shelf', displayName: '货架', mappedColumn: '货架' },
  { fieldId: 'totalStock', displayName: '库存总数', mappedColumn: '库存总数' },
  { fieldId: 'inflowQty', displayName: '入库数量', mappedColumn: '入库数量' },
  { fieldId: 'outflowQty', displayName: '出库数量', mappedColumn: '出库数量' },
  { fieldId: 'remarks', displayName: '备注', mappedColumn: '备注' },
];

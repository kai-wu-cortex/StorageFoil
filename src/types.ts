export interface DailyActivity {
  day: number; // e.g. 1, 2, 3, 4, 5
  inQty: number;
  outQty: number;
}

export interface InventoryBatch {
  id: string;
  sourceId?: string;
  sourceName?: string;
  productModel: string; // 产品型号
  batchCode: string;    // 产品批次
  specification: string; // 规格
  shelf: string;         // 货架 (e.g. 19-3A, 19-1A)
  totalStock: number;    // 库存总数
  inflowQty: number;     // 入库数量
  outflowQty: number;    // 出库数量
  remarks: string;       // 备注
  dailyActivities: DailyActivity[]; // 1号至5号(或更多)的出入库统计
  createdAt: string;
}

export interface WpsDataSource {
  id: string;
  name: string;
  enabled: boolean;
  fileId: string;
  worksheetId: number;
  worksheetIdByMonth: Record<string, number>;
  worksheetIdStart: number;
  worksheetIdEnd: number;
}

export interface TransactionHistory {
  id: string;
  batchId: string;
  batchCode: string;
  productModel: string;
  type: 'in' | 'out';
  qty: number;
  day: number;
  timestamp: string;
  operator: string;
  notes?: string;
}

export interface ShelfDetail {
  id: string;      // e.g. "19-3A"
  row: string;     // "19"
  section: string; // "3"
  level: string;   // "A"
}

export interface WpsFieldConfig {
  fieldId: keyof Pick<
    InventoryBatch,
    | 'productModel'
    | 'batchCode'
    | 'specification'
    | 'shelf'
    | 'totalStock'
    | 'inflowQty'
    | 'outflowQty'
    | 'remarks'
    | 'createdAt'
  >;
  displayName: string;
  mappedColumn: string;
  required?: boolean;
}

export interface WpsSyncConfig {
  apiUrl: string;
  appId: string;
  appKey: string;
  redirectUri: string;
  fileId: string;
  worksheetId: number;
  worksheetIdByMonth: Record<string, number>;
  rowFrom: number;
  rowTo: number;
  colFrom: number;
  colTo: number;
  code: string;
  fieldConfig: WpsFieldConfig[];
  sources: WpsDataSource[];
}

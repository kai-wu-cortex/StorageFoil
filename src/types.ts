export interface DailyActivity {
  day: number; // e.g. 1, 2, 3, 4, 5
  inQty: number;
  outQty: number;
}

export interface InventoryBatch {
  id: string;
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

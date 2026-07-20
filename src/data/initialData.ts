import { InventoryBatch, TransactionHistory } from '../types';

interface ActivityDiff {
  day: number;
  in?: number;
  out?: number;
  operator?: string;
  notes?: string;
}

// Global helper to create a batch programmatically with computed values
function createBatch(
  id: string,
  productModel: string,
  batchCode: string,
  specification: string,
  shelf: string,
  remarks: string,
  createdAt: string,
  initialIn: number,
  extraActivities: ActivityDiff[] = []
): { batch: InventoryBatch; txs: TransactionHistory[] } {
  // Initialize daily activities for 31 days with day 1 initialIn
  const dailyActivities = Array.from({ length: 31 }, (_, i) => ({
    day: i + 1,
    inQty: i === 0 ? initialIn : 0,
    outQty: 0,
  }));

  const txs: TransactionHistory[] = [];

  // Add initial transaction log
  txs.push({
    id: `t-${id}-init`,
    batchId: id,
    batchCode,
    productModel,
    type: 'in',
    qty: initialIn,
    day: 1,
    timestamp: '2026-07-01T08:00:00Z',
    operator: '系统管理员',
    notes: remarks ? `初始期初结转入库，备注: ${remarks}` : '期初库存正常结转。',
  });

  // Generate automated realistic background daily activities deterministically per batch
  let seed = 0;
  for (let i = 0; i < id.length; i++) {
    seed += id.charCodeAt(i);
  }
  const randomNum = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const autoActivities: ActivityDiff[] = [];
  let runningStock = initialIn;

  // Let's populate random activities between day 2 and day 28
  for (let d = 2; d <= 28; d++) {
    const roll = randomNum();
    if (roll < 0.28) { // 28% chance of daily activity
      const isOut = randomNum() < 0.65; // More outflows than inflows
      if (isOut && runningStock > 2) {
        const outQty = Math.floor(randomNum() * Math.min(runningStock - 1, 4)) + 1;
        runningStock -= outQty;
        autoActivities.push({
          day: d,
          out: outQty,
          operator: randomNum() > 0.5 ? '王建国' : '李秀兰',
          notes: randomNum() > 0.5 ? '销售分批出库' : '分切车间领料'
        });
      } else {
        const inQty = Math.floor(randomNum() * 5) + 1;
        runningStock += inQty;
        autoActivities.push({
          day: d,
          in: inQty,
          operator: randomNum() > 0.5 ? '陈师傅' : '张工',
          notes: '车间生产入库'
        });
      }
    }
  }

  // Merge automated activities and explicit ones, sorting by day
  const allActsMap: { [day: number]: ActivityDiff } = {};
  
  // Apply auto first
  autoActivities.forEach(act => {
    allActsMap[act.day] = act;
  });
  
  // Apply explicit (overrides or merges)
  extraActivities.forEach(act => {
    if (allActsMap[act.day]) {
      allActsMap[act.day] = {
        ...allActsMap[act.day],
        ...act,
        in: act.in !== undefined ? act.in : allActsMap[act.day].in,
        out: act.out !== undefined ? act.out : allActsMap[act.day].out,
      };
    } else {
      allActsMap[act.day] = act;
    }
  });

  const finalSortedActivities = Object.values(allActsMap).sort((a, b) => a.day - b.day);

  // Apply final sorted activities across the month
  finalSortedActivities.forEach((act, idx) => {
    const dayIndex = act.day - 1;
    if (dayIndex >= 0 && dayIndex < 31) {
      if (act.in !== undefined && act.in > 0) {
        dailyActivities[dayIndex].inQty += act.in;
        txs.push({
          id: `t-${id}-in-${idx}`,
          batchId: id,
          batchCode,
          productModel,
          type: 'in',
          qty: act.in,
          day: act.day,
          timestamp: `2026-07-${String(act.day).padStart(2, '0')}T09:15:00Z`,
          operator: act.operator || '仓库记录员',
          notes: act.notes || '生产完工入库',
        });
      }
      if (act.out !== undefined && act.out > 0) {
        dailyActivities[dayIndex].outQty += act.out;
        txs.push({
          id: `t-${id}-out-${idx}`,
          batchId: id,
          batchCode,
          productModel,
          type: 'out',
          qty: act.out,
          day: act.day,
          timestamp: `2026-07-${String(act.day).padStart(2, '0')}T14:30:00Z`,
          operator: act.operator || '出库发货员',
          notes: act.notes || '销售出库 / 生产分切领料',
        });
      }
    }
  });

  const inflowQty = dailyActivities.reduce((sum, a) => sum + a.inQty, 0);
  const outflowQty = dailyActivities.reduce((sum, a) => sum + a.outQty, 0);
  const totalStock = Math.max(0, inflowQty - outflowQty);

  const batch: InventoryBatch = {
    id,
    productModel,
    batchCode,
    specification,
    shelf,
    totalStock,
    inflowQty,
    outflowQty,
    remarks,
    dailyActivities,
    createdAt,
  };

  return { batch, txs };
}

// Build all 17 batches programmatically
const batchDefinitions: Array<{
  id: string;
  model: string;
  code: string;
  spec: string;
  shelf: string;
  remarks: string;
  createdAt: string;
  initialIn: number;
  extras: ActivityDiff[];
}> = [
  {
    id: 'b-1',
    model: 'PL',
    code: '20211110',
    spec: '0.64*120M',
    shelf: '19-3A',
    remarks: '有白边',
    createdAt: '2021-11-10T08:00:00Z',
    initialIn: 10,
    extras: [
      { day: 5, out: 2, operator: '周建国', notes: '分切生产车间领料 2支' },
      { day: 12, out: 2, operator: '王小明', notes: '客户样品试样出库 2支' },
      { day: 18, in: 4, operator: '张大林', notes: '退货返修入库 4支' },
      { day: 25, out: 4, operator: '周建国', notes: '分切生产车间领料 4支' },
    ],
  },
  {
    id: 'b-2',
    model: 'PL',
    code: '20210620',
    spec: '0.64*120M',
    shelf: '19-1A',
    remarks: '3支%80离型，1支%50, 1支烘烤过，1支胶底不良',
    createdAt: '2021-06-20T08:00:00Z',
    initialIn: 12,
    extras: [
      { day: 8, out: 3, operator: '陈工', notes: '胶底测试打样领料 3支' },
      { day: 15, out: 3, operator: '陈工', notes: '高硬离型测试领用 3支' },
    ],
  },
  {
    id: 'b-3',
    model: 'PL',
    code: '20210908',
    spec: '0.64*120M',
    shelf: '19-4C',
    remarks: '',
    createdAt: '2021-09-08T08:00:00Z',
    initialIn: 8,
    extras: [
      { day: 4, out: 2, operator: '周建国', notes: '车间日常领料 2支' },
      { day: 22, out: 1, operator: '王小明', notes: '分切销售领料 1支' },
    ],
  },
  {
    id: 'b-4',
    model: 'PL',
    code: '20211115',
    spec: '0.64*120M',
    shelf: '19-4C',
    remarks: '',
    createdAt: '2021-11-15T08:00:00Z',
    initialIn: 25,
    extras: [
      { day: 3, out: 5, operator: '王小明', notes: '批量外发加工 5支' },
      { day: 10, out: 5, operator: '王小明', notes: '销售直发客户 5支' },
      { day: 16, in: 10, operator: '张大林', notes: '生产完工入库 10支' },
      { day: 24, out: 5, operator: '周建国', notes: '大宗订单分切领用 5支' },
    ],
  },
  {
    id: 'b-5',
    model: 'PL',
    code: '221118-1',
    spec: '0.64*120M',
    shelf: '19-3A',
    remarks: '全部有麻点',
    createdAt: '2022-11-18T08:00:00Z',
    initialIn: 50,
    extras: [
      { day: 6, out: 10, operator: '王小明', notes: '降级处理销售出库 10支' },
      { day: 14, out: 8, operator: '周建国', notes: '麻点料分切处理 8支' },
      { day: 20, in: 20, operator: '张大林', notes: '采购补充麻点基膜入库 20支' },
      { day: 28, out: 6, operator: '周建国', notes: '拼箱发货领料 6支' },
    ],
  },
  {
    id: 'b-6',
    model: 'PL',
    code: '20211207',
    spec: '0.64*120M',
    shelf: '19-1C',
    remarks: '',
    createdAt: '2021-12-07T08:00:00Z',
    initialIn: 80,
    extras: [
      { day: 9, out: 15, operator: '王小明', notes: '大宗客户订单交期发货 15支' },
      { day: 17, out: 10, operator: '王小明', notes: '二级分销商领料 10支' },
      { day: 22, in: 15, operator: '张大林', notes: '涂布一车间交库 15支' },
      { day: 29, out: 5, operator: '周建国', notes: '月末零星补发 5支' },
    ],
  },
  {
    id: 'b-7',
    model: 'PL',
    code: '20211208①',
    spec: '0.64*120M',
    shelf: '19-5C',
    remarks: '胶底不一样可用',
    createdAt: '2021-12-08T08:00:00Z',
    initialIn: 8,
    extras: [
      { day: 11, out: 3, operator: '陈工', notes: '特种标签打样领料 3支' },
    ],
  },
  {
    id: 'b-8',
    model: 'PL',
    code: '20211208②',
    spec: '0.64*120M',
    shelf: '19-5C',
    remarks: '',
    createdAt: '2021-12-08T09:00:00Z',
    initialIn: 10,
    extras: [
      { day: 13, out: 5, operator: '周建国', notes: '一号线日常领用 5支' },
    ],
  },
  {
    id: 'b-9',
    model: 'PL',
    code: '20211120',
    spec: '0.64*120M',
    shelf: '19-5C',
    remarks: '5号胶分切差',
    createdAt: '2021-11-20T08:00:00Z',
    initialIn: 12,
    extras: [
      { day: 7, out: 6, operator: '周建国', notes: '次品降级分切处理 6支' },
    ],
  },
  {
    id: 'b-10',
    model: 'PL',
    code: '20210819',
    spec: '0.64*120M',
    shelf: '19-1C',
    remarks: '',
    createdAt: '2021-08-19T08:00:00Z',
    initialIn: 45,
    extras: [
      { day: 14, out: 7, operator: '王小明', notes: '华南仓调拨出库 7支' },
      { day: 19, in: 5, operator: '张大林', notes: '工厂盘盈退库 5支' },
      { day: 23, out: 5, operator: '周建国', notes: '车间应急备件领用 5支' },
    ],
  },
  {
    id: 'b-11',
    model: 'PL',
    code: '20210510',
    spec: '0.64*120M',
    shelf: '19-4C',
    remarks: '',
    createdAt: '2021-05-10T08:00:00Z',
    initialIn: 55,
    extras: [
      { day: 8, out: 15, operator: '王小明', notes: '外贸订单装箱发货 15支' },
      { day: 12, in: 10, operator: '张大林', notes: '涂布二车间补交库 10支' },
      { day: 25, out: 10, operator: '周建国', notes: '大货分切大组领料 10支' },
    ],
  },
  {
    id: 'b-12',
    model: 'PL',
    code: '20211019',
    spec: '0.64*120M',
    shelf: '19-5C',
    remarks: '6号胶',
    createdAt: '2021-10-19T08:00:00Z',
    initialIn: 15,
    extras: [
      { day: 20, out: 8, operator: '陈工', notes: '抗刮测试专线领料 8支' },
    ],
  },
  {
    id: 'b-13',
    model: 'PL',
    code: '20211123',
    spec: '0.64*120M',
    shelf: '19-5C',
    remarks: '分切差',
    createdAt: '2021-11-23T08:00:00Z',
    initialIn: 10,
    extras: [
      { day: 15, out: 6, operator: '周建国', notes: '打冷线生产备用 6支' },
    ],
  },
  {
    id: 'b-14',
    model: 'PL',
    code: '20211130',
    spec: '0.64*120M',
    shelf: '19-5C',
    remarks: '待确定',
    createdAt: '2021-11-30T08:00:00Z',
    initialIn: 15,
    extras: [
      { day: 18, out: 6, operator: '周建国', notes: '样品备切出库 6支' },
    ],
  },
  {
    id: 'b-15',
    model: 'PL',
    code: '20220110',
    spec: '0.64*120M',
    shelf: '19-5C',
    remarks: '咖啡底',
    createdAt: '2022-01-10T08:00:00Z',
    initialIn: 20,
    extras: [
      { day: 22, out: 10, operator: '王小明', notes: '咖啡离型膜销售 10支' },
    ],
  },
  {
    id: 'b-16',
    model: 'PL',
    code: '20220408',
    spec: '0.64*120M',
    shelf: '19-3A',
    remarks: '白边',
    createdAt: '2022-04-08T08:00:00Z',
    initialIn: 12,
    extras: [
      { day: 26, out: 6, operator: '周建国', notes: '白边料试验领用 6支' },
    ],
  },
  {
    id: 'b-17',
    model: 'PL',
    code: '220614-2',
    spec: '0.64*120M',
    shelf: '19-1A',
    remarks: '',
    createdAt: '2022-06-14T08:00:00Z',
    initialIn: 5,
    extras: [
      { day: 30, out: 4, operator: '周建国', notes: '月底冲销领料 4支' },
    ],
  },
];

// Generate final collections
const generatedBatches: InventoryBatch[] = [];
const generatedTxs: TransactionHistory[] = [];

batchDefinitions.forEach((def) => {
  const { batch, txs } = createBatch(
    def.id,
    def.model,
    def.code,
    def.spec,
    def.shelf,
    def.remarks,
    def.createdAt,
    def.initialIn,
    def.extras
  );
  generatedBatches.push(batch);
  generatedTxs.push(...txs);
});

// Sort transactions chronologically desc
generatedTxs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

export const INITIAL_BATCHES: InventoryBatch[] = generatedBatches;
export const INITIAL_TRANSACTIONS: TransactionHistory[] = generatedTxs;

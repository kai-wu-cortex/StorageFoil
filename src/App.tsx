import React, { useState, useEffect, useMemo } from 'react';
import { InventoryBatch, TransactionHistory } from './types';
import { INITIAL_BATCHES, INITIAL_TRANSACTIONS } from './data/initialData';
import StatsDashboard from './components/StatsDashboard';
import InventoryTable from './components/InventoryTable';
import ShelfVisualizer from './components/ShelfVisualizer';
import InventoryQueryConsole from './components/InventoryQueryConsole';
import TransactionModal from './components/TransactionModal';
import AddBatchModal from './components/AddBatchModal';
import PreviousMonthBalanceView from './components/PreviousMonthBalanceView';
import InventoryCards from './components/InventoryCards';
import TimeScaleView from './components/TimeScaleView';
import { motion, AnimatePresence } from 'motion/react';
import {
  Database,
  Grid,
  FileSpreadsheet,
  History,
  RotateCcw,
  Download,
  Upload,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  AlertTriangle,
  Plus,
  X,
  Search,
  Clock
} from 'lucide-react';

const getPreseededDataForMonth = (month: string) => {
  if (month === '2026-07') {
    return { batches: INITIAL_BATCHES, transactions: INITIAL_TRANSACTIONS };
  }
  
  if (month === '2026-06') {
    // Generate June batches so ending inventory matches July's initial inventory (INITIAL_BATCHES)
    const juneBatches = INITIAL_BATCHES.map(b => {
      // Simulate slightly higher stock in June, with some outflows leading to July's starting stock
      const juneStartingStock = Math.round(b.inflowQty * 1.3);
      const juneOutflow = juneStartingStock - b.inflowQty;
      const activities = Array.from({ length: 31 }, (_, i) => ({
        day: i + 1,
        inQty: i === 0 ? juneStartingStock : 0,
        outQty: i === 14 ? juneOutflow : 0,
      }));
      return {
        ...b,
        id: `${b.id}-june`,
        totalStock: b.inflowQty, // Ending stock matches July's starting stock
        inflowQty: juneStartingStock,
        outflowQty: juneOutflow,
        dailyActivities: activities,
        createdAt: '2026-06-01T08:00:00Z',
      };
    });
    
    const juneTransactions = INITIAL_TRANSACTIONS.map(t => ({
      ...t,
      id: `${t.id}-june`,
      batchId: `${t.batchId}-june`,
      timestamp: t.timestamp.replace('07', '06'),
    }));
    
    return { batches: juneBatches, transactions: juneTransactions };
  }
  
  // Default for other months (like 2026-05)
  if (month === '2026-05') {
    const mayBatches = INITIAL_BATCHES.map(b => {
      const mayStartingStock = Math.round(b.inflowQty * 1.5);
      const mayOutflow = mayStartingStock - b.inflowQty;
      const activities = Array.from({ length: 31 }, (_, i) => ({
        day: i + 1,
        inQty: i === 0 ? mayStartingStock : 0,
        outQty: i === 19 ? mayOutflow : 0,
      }));
      return {
        ...b,
        id: `${b.id}-may`,
        totalStock: b.inflowQty,
        inflowQty: mayStartingStock,
        outflowQty: mayOutflow,
        dailyActivities: activities,
        createdAt: '2026-05-01T08:00:00Z',
      };
    });
    const mayTransactions = INITIAL_TRANSACTIONS.map(t => ({
      ...t,
      id: `${t.id}-may`,
      batchId: `${t.batchId}-may`,
      timestamp: t.timestamp.replace('07', '05'),
    }));
    return { batches: mayBatches, transactions: mayTransactions };
  }
  
  return { batches: [], transactions: [] };
};

export default function App() {
  // Global States loaded from localStorage or seeded
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [transactions, setTransactions] = useState<TransactionHistory[]>([]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  // Month sheets states
  const [monthsList, setMonthsList] = useState<string[]>([]);
  const [currentMonth, setCurrentMonth] = useState<string>('2026-07');
  const [isCreateMonthOpen, setIsCreateMonthOpen] = useState(false);

  // Create month form states
  const [newMonthYear, setNewMonthYear] = useState('2026');
  const [newMonthVal, setNewMonthVal] = useState('08');
  const [newMonthMode, setNewMonthMode] = useState<'rollover' | 'empty'>('rollover');

  // Layout Tab selection
  const [activeTab, setActiveTab] = useState<'query' | 'table' | 'visual' | 'previous_month' | 'timeline' | 'logs' | 'management'>('query');

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedShelf, setSelectedShelf] = useState<string | null>(null);
  const [selectedWarningFilter, setSelectedWarningFilter] = useState<string | null>(null);
  const [selectedStockLevelFilter, setSelectedStockLevelFilter] = useState<'low' | 'high' | 'in_stock' | null>(null);
  const [sortBy, setSortBy] = useState<'inflow' | 'outflow' | null>(null);

  // Modals controller
  const [isAddBatchOpen, setIsAddBatchOpen] = useState(false);
  const [transactionTarget, setTransactionTarget] = useState<{
    batch: InventoryBatch;
    type: 'in' | 'out';
  } | null>(null);

  // Load from LocalStorage
  useEffect(() => {
    // One-time reset to force seed new rich random activities
    const seedMarker = localStorage.getItem('pl_inventory_seeded_v1_3');
    if (!seedMarker) {
      localStorage.clear();
      localStorage.setItem('pl_inventory_seeded_v1_3', 'true');
    }

    // 1. Read months list
    let savedMonths = localStorage.getItem('pl_inventory_months');
    let monthsListParsed: string[] = ['2026-07', '2026-06'];
    if (savedMonths) {
      try {
        monthsListParsed = JSON.parse(savedMonths);
      } catch (e) {
        // use default
      }
    } else {
      localStorage.setItem('pl_inventory_months', JSON.stringify(monthsListParsed));
    }
    setMonthsList(monthsListParsed);

    // 2. Read active month
    let activeMonth = localStorage.getItem('pl_inventory_active_month') || '2026-07';
    if (!monthsListParsed.includes(activeMonth)) {
      activeMonth = monthsListParsed[0] || '2026-07';
    }
    setCurrentMonth(activeMonth);

    // 3. Migrate legacy undivided keys if needed
    const legacyBatches = localStorage.getItem('pl_inventory_batches');
    const legacyTransactions = localStorage.getItem('pl_inventory_transactions');
    if (legacyBatches && !localStorage.getItem('pl_inventory_batches_2026-07')) {
      localStorage.setItem('pl_inventory_batches_2026-07', legacyBatches);
      if (legacyTransactions) {
        localStorage.setItem('pl_inventory_transactions_2026-07', legacyTransactions);
      }
      // Clear legacy keys to avoid confusion
      localStorage.removeItem('pl_inventory_batches');
      localStorage.removeItem('pl_inventory_transactions');
    }

    // 4. Load target month data
    const savedBatches = localStorage.getItem(`pl_inventory_batches_${activeMonth}`);
    const savedTransactions = localStorage.getItem(`pl_inventory_transactions_${activeMonth}`);

    let activeBatches: InventoryBatch[] = [];
    let activeTransactions: TransactionHistory[] = [];

    if (savedBatches && savedTransactions) {
      try {
        activeBatches = JSON.parse(savedBatches);
        activeTransactions = JSON.parse(savedTransactions);
      } catch (e) {
        const seeded = getPreseededDataForMonth(activeMonth);
        activeBatches = seeded.batches;
        activeTransactions = seeded.transactions;
      }
    } else {
      const seeded = getPreseededDataForMonth(activeMonth);
      activeBatches = seeded.batches;
      activeTransactions = seeded.transactions;
    }

    // Ensure 31 daily activities per batch
    const migratedBatches = activeBatches.map(batch => {
      if (batch.dailyActivities.length < 31) {
        const extendedActivities = Array.from({ length: 31 }, (_, i) => {
          const dayNum = i + 1;
          const existing = batch.dailyActivities.find(a => a.day === dayNum);
          return existing || { day: dayNum, inQty: 0, outQty: 0 };
        });
        return { ...batch, dailyActivities: extendedActivities };
      }
      return batch;
    });

    setBatches(migratedBatches);
    setTransactions(activeTransactions);
    
    // Save synchronized states
    localStorage.setItem(`pl_inventory_batches_${activeMonth}`, JSON.stringify(migratedBatches));
    localStorage.setItem(`pl_inventory_transactions_${activeMonth}`, JSON.stringify(activeTransactions));
    
    setIsDataLoaded(true);
  }, []);

  // Sync to LocalStorage (Target Month defaults to current)
  const saveStateToLocalStorage = (updatedBatches: InventoryBatch[], updatedTrans: TransactionHistory[], targetMonth = currentMonth) => {
    setBatches(updatedBatches);
    setTransactions(updatedTrans);
    localStorage.setItem(`pl_inventory_batches_${targetMonth}`, JSON.stringify(updatedBatches));
    localStorage.setItem(`pl_inventory_transactions_${targetMonth}`, JSON.stringify(updatedTrans));
  };

  // Switch month sheet
  const handleSwitchMonth = (targetMonth: string) => {
    if (targetMonth === currentMonth) return;

    // 1. Save current state first
    localStorage.setItem(`pl_inventory_batches_${currentMonth}`, JSON.stringify(batches));
    localStorage.setItem(`pl_inventory_transactions_${currentMonth}`, JSON.stringify(transactions));

    // 2. Load target state
    const savedBatches = localStorage.getItem(`pl_inventory_batches_${targetMonth}`);
    const savedTransactions = localStorage.getItem(`pl_inventory_transactions_${targetMonth}`);

    let loadedBatches: InventoryBatch[] = [];
    let loadedTransactions: TransactionHistory[] = [];

    if (savedBatches && savedTransactions) {
      try {
        loadedBatches = JSON.parse(savedBatches);
        loadedTransactions = JSON.parse(savedTransactions);
      } catch (e) {
        const seeded = getPreseededDataForMonth(targetMonth);
        loadedBatches = seeded.batches;
        loadedTransactions = seeded.transactions;
      }
    } else {
      const seeded = getPreseededDataForMonth(targetMonth);
      loadedBatches = seeded.batches;
      loadedTransactions = seeded.transactions;
    }

    // Migrate batches to 31 days
    const migratedBatches = loadedBatches.map(batch => {
      if (batch.dailyActivities.length < 31) {
        const extendedActivities = Array.from({ length: 31 }, (_, i) => {
          const dayNum = i + 1;
          const existing = batch.dailyActivities.find(a => a.day === dayNum);
          return existing || { day: dayNum, inQty: 0, outQty: 0 };
        });
        return { ...batch, dailyActivities: extendedActivities };
      }
      return batch;
    });

    setBatches(migratedBatches);
    setTransactions(loadedTransactions);
    setCurrentMonth(targetMonth);
    localStorage.setItem('pl_inventory_active_month', targetMonth);

    localStorage.setItem(`pl_inventory_batches_${targetMonth}`, JSON.stringify(migratedBatches));
    localStorage.setItem(`pl_inventory_transactions_${targetMonth}`, JSON.stringify(loadedTransactions));
  };

  // Create a new monthly sheet (with optional roll-forward)
  const handleCreateMonth = (year: string, month: string, mode: 'rollover' | 'empty') => {
    const newMonthStr = `${year}-${month}`;
    if (monthsList.includes(newMonthStr)) {
      alert(`工作表月份 ${newMonthStr} 已存在！`);
      return;
    }

    // 1. Save current month's data
    localStorage.setItem(`pl_inventory_batches_${currentMonth}`, JSON.stringify(batches));
    localStorage.setItem(`pl_inventory_transactions_${currentMonth}`, JSON.stringify(transactions));

    let newBatches: InventoryBatch[] = [];
    let newTransactions: TransactionHistory[] = [];

    if (mode === 'rollover') {
      // Roll forward ending stocks of active batches with totalStock >= 0
      newBatches = batches.map((b, idx) => {
        const carryOverQty = b.totalStock;
        
        // Setup daily activities with Day 1 having the carryover qty as starting stock
        const dailyActivities = Array.from({ length: 31 }, (_, i) => ({
          day: i + 1,
          inQty: i === 0 ? carryOverQty : 0,
          outQty: 0,
        }));

        return {
          id: `b-roll-${Date.now()}-${idx}`,
          productModel: b.productModel,
          batchCode: b.batchCode,
          specification: b.specification,
          shelf: b.shelf,
          totalStock: carryOverQty,
          inflowQty: carryOverQty,
          outflowQty: 0,
          remarks: b.remarks,
          dailyActivities,
          createdAt: new Date().toISOString(),
        };
      });

      // Create rollover transaction logs for record keeping
      newTransactions = newBatches.map((b, idx) => ({
        id: `t-roll-${Date.now()}-${idx}`,
        batchId: b.id,
        batchCode: b.batchCode,
        productModel: b.productModel,
        type: 'in' as const,
        qty: b.totalStock,
        day: 1,
        timestamp: new Date().toISOString(),
        operator: '系统自动结转',
        notes: `从上月(${currentMonth})自动结转期末库存。期初结转数 ${b.totalStock} 支。`,
      }));
    } else {
      // Empty sheet
      newBatches = [];
      newTransactions = [];
    }

    // Add to monthsList and sort descending
    const updatedMonths = [...monthsList, newMonthStr].sort((a, b) => b.localeCompare(a));
    setMonthsList(updatedMonths);
    localStorage.setItem('pl_inventory_months', JSON.stringify(updatedMonths));

    // Switch state to new month
    setCurrentMonth(newMonthStr);
    localStorage.setItem('pl_inventory_active_month', newMonthStr);

    setBatches(newBatches);
    setTransactions(newTransactions);

    localStorage.setItem(`pl_inventory_batches_${newMonthStr}`, JSON.stringify(newBatches));
    localStorage.setItem(`pl_inventory_transactions_${newMonthStr}`, JSON.stringify(newTransactions));

    setIsCreateMonthOpen(false);
    alert(`成功创建并切换至 ${year}年${month}月 工作表！`);
  };

  // Add a brand new batch
  const handleAddBatch = (data: {
    productModel: string;
    batchCode: string;
    specification: string;
    shelf: string;
    initialQty: number;
    remarks: string;
    operator: string;
  }) => {
    const newBatchId = `b-${Date.now()}`;
    const newBatch: InventoryBatch = {
      id: newBatchId,
      productModel: data.productModel,
      batchCode: data.batchCode,
      specification: data.specification,
      shelf: data.shelf,
      totalStock: data.initialQty,
      inflowQty: data.initialQty,
      outflowQty: 0,
      remarks: data.remarks,
      dailyActivities: Array.from({ length: 31 }, (_, i) => ({
        day: i + 1,
        inQty: i === 0 ? data.initialQty : 0,
        outQty: 0,
      })),
      createdAt: new Date().toISOString(),
    };

    const newTx: TransactionHistory = {
      id: `t-${Date.now()}`,
      batchId: newBatchId,
      batchCode: data.batchCode,
      productModel: data.productModel,
      type: 'in',
      qty: data.initialQty,
      day: 1,
      timestamp: new Date().toISOString(),
      operator: data.operator,
      notes: `初次登记入库，备注: ${data.remarks || '无'}`,
    };

    const updatedBatches = [newBatch, ...batches];
    const updatedTrans = [newTx, ...transactions];

    saveStateToLocalStorage(updatedBatches, updatedTrans);
    setIsAddBatchOpen(false);
  };

  // Process dynamic in/out adjustment
  const handleTransactionSubmit = (data: {
    batchId: string;
    type: 'in' | 'out';
    qty: number;
    day: number;
    operator: string;
    notes: string;
  }) => {
    const updatedBatches = batches.map((batch) => {
      if (batch.id !== data.batchId) return batch;

      // Deep copy daily activities
      const updatedActivities = batch.dailyActivities.map((act) => {
        if (act.day !== data.day) return act;
        
        if (data.type === 'in') {
          return { ...act, inQty: act.inQty + data.qty };
        } else {
          return { ...act, outQty: act.outQty + data.qty };
        }
      });

      // Calculate total aggregates
      const totalInflow = updatedActivities.reduce((sum, act) => sum + act.inQty, 0);
      const totalOutflow = updatedActivities.reduce((sum, act) => sum + act.outQty, 0);
      const totalStock = totalInflow - totalOutflow;

      return {
        ...batch,
        dailyActivities: updatedActivities,
        inflowQty: totalInflow,
        outflowQty: totalOutflow,
        totalStock: Math.max(0, totalStock),
      };
    });

    // Lookup batch info for transaction record
    const targetedBatch = batches.find((b) => b.id === data.batchId);
    const newTx: TransactionHistory = {
      id: `t-${Date.now()}`,
      batchId: data.batchId,
      batchCode: targetedBatch?.batchCode || '未知批次',
      productModel: targetedBatch?.productModel || 'PL',
      type: data.type,
      qty: data.qty,
      day: data.day,
      timestamp: new Date().toISOString(),
      operator: data.operator,
      notes: data.notes,
    };

    const updatedTrans = [newTx, ...transactions];
    saveStateToLocalStorage(updatedBatches, updatedTrans);
    setTransactionTarget(null);
  };

  // Inline table updates
  const handleUpdateBatch = (id: string, updatedFields: Partial<InventoryBatch>) => {
    const updatedBatches = batches.map((batch) => {
      if (batch.id === id) {
        return { ...batch, ...updatedFields };
      }
      return batch;
    });
    saveStateToLocalStorage(updatedBatches, transactions);
  };

  // Carry forward single batch from previous month
  const handleCarryForwardBatch = (prevBatch: InventoryBatch, comparisonMonthName: string) => {
    if (batches.some((b) => b.batchCode === prevBatch.batchCode)) {
      alert(`批次号 ${prevBatch.batchCode} 在当前月度工作表中已存在！`);
      return;
    }

    const carryOverQty = prevBatch.totalStock;
    const newBatchId = `b-roll-${Date.now()}`;
    const dailyActivities = Array.from({ length: 31 }, (_, i) => ({
      day: i + 1,
      inQty: i === 0 ? carryOverQty : 0,
      outQty: 0,
    }));

    const newBatch: InventoryBatch = {
      id: newBatchId,
      productModel: prevBatch.productModel,
      batchCode: prevBatch.batchCode,
      specification: prevBatch.specification,
      shelf: prevBatch.shelf,
      totalStock: carryOverQty,
      inflowQty: carryOverQty,
      outflowQty: 0,
      remarks: prevBatch.remarks,
      dailyActivities,
      createdAt: new Date().toISOString(),
    };

    const newTx: TransactionHistory = {
      id: `t-roll-${Date.now()}`,
      batchId: newBatchId,
      batchCode: prevBatch.batchCode,
      productModel: prevBatch.productModel,
      type: 'in',
      qty: carryOverQty,
      day: 1,
      timestamp: new Date().toISOString(),
      operator: '系统自动结转',
      notes: `从上月(${comparisonMonthName})自动结转期末库存。期初结转数 ${carryOverQty} 支。`,
    };

    const updatedBatches = [newBatch, ...batches];
    const updatedTrans = [newTx, ...transactions];

    saveStateToLocalStorage(updatedBatches, updatedTrans);
    alert(`已将批次 ${prevBatch.batchCode} 成功结转至本期，期初结转数 ${carryOverQty} 支。`);
  };

  // Sync batch qty to match previous month's ending stock
  const handleSyncBatchQty = (batchCode: string, newQty: number, comparisonMonthName: string) => {
    const existingIndex = batches.findIndex((b) => b.batchCode === batchCode);
    if (existingIndex === -1) {
      alert(`在当前月份未找到批次 ${batchCode}！`);
      return;
    }

    const targetBatch = batches[existingIndex];
    const updatedBatches = batches.map((b, idx) => {
      if (idx !== existingIndex) return b;

      const updatedActivities = b.dailyActivities.map((act) => {
        if (act.day === 1) {
          return { ...act, inQty: newQty };
        }
        return act;
      });

      const totalInflow = updatedActivities.reduce((sum, act) => sum + act.inQty, 0);
      const totalOutflow = updatedActivities.reduce((sum, act) => sum + act.outQty, 0);
      const totalStock = totalInflow - totalOutflow;

      return {
        ...b,
        dailyActivities: updatedActivities,
        inflowQty: totalInflow,
        outflowQty: totalOutflow,
        totalStock: Math.max(0, totalStock),
      };
    });

    const newTx: TransactionHistory = {
      id: `t-sync-${Date.now()}`,
      batchId: targetBatch.id,
      batchCode: batchCode,
      productModel: targetBatch.productModel,
      type: 'in',
      qty: newQty,
      day: 1,
      timestamp: new Date().toISOString(),
      operator: '结转库存校准',
      notes: `对账后同步校准本期期初结转数。自上月(${comparisonMonthName})期末结余调整为 ${newQty} 支。`,
    };

    const updatedTrans = [newTx, ...transactions];
    saveStateToLocalStorage(updatedBatches, updatedTrans);
    alert(`已将批次 ${batchCode} 的本期期初库存成功校准为 ${newQty} 支！`);
  };

  // Carry forward all uncarried batches with positive balance
  const handleCarryForwardAll = (prevBatches: InventoryBatch[], comparisonMonthName: string) => {
    let count = 0;
    const newBatchesList = [...batches];
    const newTxList = [...transactions];

    prevBatches.forEach((prevBatch, idx) => {
      if (newBatchesList.some((b) => b.batchCode === prevBatch.batchCode)) {
        return;
      }

      const carryOverQty = prevBatch.totalStock;
      const newBatchId = `b-roll-${Date.now()}-${idx}`;
      const dailyActivities = Array.from({ length: 31 }, (_, i) => ({
        day: i + 1,
        inQty: i === 0 ? carryOverQty : 0,
        outQty: 0,
      }));

      const newBatch: InventoryBatch = {
        id: newBatchId,
        productModel: prevBatch.productModel,
        batchCode: prevBatch.batchCode,
        specification: prevBatch.specification,
        shelf: prevBatch.shelf,
        totalStock: carryOverQty,
        inflowQty: carryOverQty,
        outflowQty: 0,
        remarks: prevBatch.remarks,
        dailyActivities,
        createdAt: new Date().toISOString(),
      };

      const newTx: TransactionHistory = {
        id: `t-roll-${Date.now()}-${idx}`,
        batchId: newBatchId,
        batchCode: prevBatch.batchCode,
        productModel: prevBatch.productModel,
        type: 'in',
        qty: carryOverQty,
        day: 1,
        timestamp: new Date().toISOString(),
        operator: '系统自动结转',
        notes: `从上月(${comparisonMonthName})自动结转期末库存。期初数量 ${carryOverQty} 支。`,
      };

      newBatchesList.unshift(newBatch);
      newTxList.unshift(newTx);
      count++;
    });

    if (count === 0) {
      alert('所有上月有结余的批次在本期已存在！');
      return;
    }

    saveStateToLocalStorage(newBatchesList, newTxList);
    alert(`成功批量结转 ${count} 个批次至本期工作表！`);
  };

  // Backup Options
  const handleResetData = () => {
    if (window.confirm('您确定要重置所有库存数据和操作日志吗？这将还原为Excel初始种子状态并清空所有额外月份。')) {
      // Clear all keys matching pl_inventory_batches_ and pl_inventory_transactions_
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('pl_inventory_batches_') || key.startsWith('pl_inventory_transactions_'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
      
      localStorage.removeItem('pl_inventory_batches');
      localStorage.removeItem('pl_inventory_transactions');
      
      const defaultMonths = ['2026-07', '2026-06'];
      localStorage.setItem('pl_inventory_months', JSON.stringify(defaultMonths));
      localStorage.setItem('pl_inventory_active_month', '2026-07');
      
      setMonthsList(defaultMonths);
      setCurrentMonth('2026-07');
      
      const seeded = getPreseededDataForMonth('2026-07');
      setBatches(seeded.batches);
      setTransactions(seeded.transactions);
      
      localStorage.setItem('pl_inventory_batches_2026-07', JSON.stringify(seeded.batches));
      localStorage.setItem('pl_inventory_transactions_2026-07', JSON.stringify(seeded.transactions));
      
      alert('数据已成功重置为初始统计表状态！');
    }
  };

  const handleExportData = () => {
    const allData: Record<string, any> = {
      monthsList,
      currentMonth,
    };
    
    monthsList.forEach(m => {
      const bStr = localStorage.getItem(`pl_inventory_batches_${m}`);
      const tStr = localStorage.getItem(`pl_inventory_transactions_${m}`);
      if (bStr) allData[`batches_${m}`] = JSON.parse(bStr);
      if (tStr) allData[`transactions_${m}`] = JSON.parse(tStr);
    });

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(allData));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `PL_Inventory_All_Sheets_Backup_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], "UTF-8");
      fileReader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (parsed.monthsList && parsed.currentMonth) {
            // Multi-month backup format
            localStorage.setItem('pl_inventory_months', JSON.stringify(parsed.monthsList));
            localStorage.setItem('pl_inventory_active_month', parsed.currentMonth);
            
            parsed.monthsList.forEach((m: string) => {
              if (parsed[`batches_${m}`]) {
                localStorage.setItem(`pl_inventory_batches_${m}`, JSON.stringify(parsed[`batches_${m}`]));
              }
              if (parsed[`transactions_${m}`]) {
                localStorage.setItem(`pl_inventory_transactions_${m}`, JSON.stringify(parsed[`transactions_${m}`]));
              }
            });
            
            setMonthsList(parsed.monthsList);
            setCurrentMonth(parsed.currentMonth);
            setBatches(parsed[`batches_${parsed.currentMonth}`] || []);
            setTransactions(parsed[`transactions_${parsed.currentMonth}`] || []);
            
            alert('成功导入多月份/多工作表完整库存状态！');
          } else if (parsed.batches && parsed.transactions) {
            // Legacy single-month backup format
            saveStateToLocalStorage(parsed.batches, parsed.transactions);
            alert(`成功导入数据至当前活动月份 (${currentMonth}) 工作表！`);
          } else {
            alert('文件格式有误，未识别的备份文件结构！');
          }
        } catch {
          alert('解析失败，请确保导入的是合法的 JSON 备份文件！');
        }
      };
    }
  };

  // Filter batches for the dedicated Inventory Query Cards view
  const filteredQueryBatches = useMemo(() => {
    return batches.filter((b) => {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch =
        !searchQuery ||
        b.batchCode.toLowerCase().includes(searchLower) ||
        b.shelf.toLowerCase().includes(searchLower) ||
        b.remarks.toLowerCase().includes(searchLower) ||
        b.specification.toLowerCase().includes(searchLower) ||
        b.productModel.toLowerCase().includes(searchLower);

      let matchesWarning = true;
      if (selectedWarningFilter === '白边') {
        matchesWarning = b.remarks.includes('白边');
      } else if (selectedWarningFilter === '麻点') {
        matchesWarning = b.remarks.includes('麻点');
      } else if (selectedWarningFilter === '胶') {
        matchesWarning = b.remarks.includes('胶') || b.remarks.includes('分切') || b.remarks.includes('胶底');
      }

      let matchesStockLevel = true;
      if (selectedStockLevelFilter === 'low') {
        matchesStockLevel = b.totalStock > 0 && b.totalStock <= 5;
      } else if (selectedStockLevelFilter === 'high') {
        matchesStockLevel = b.totalStock > 50;
      } else if (selectedStockLevelFilter === 'in_stock') {
        matchesStockLevel = b.totalStock > 0;
      }

      return matchesSearch && matchesWarning && matchesStockLevel;
    });
  }, [batches, searchQuery, selectedWarningFilter, selectedStockLevelFilter]);

  if (!isDataLoaded) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium text-slate-600">正在载入品特烫金膜出入库统计看板...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FB] text-slate-800 font-sans antialiased pb-12" id="app-root-container">
      {/* Visual Workspace Top Banner (Architectural Honesty: Minimalist and beautiful header) */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-40 shadow-xs" id="app-header">
        <div className="w-full px-4 sm:px-6 md:px-8">
          <div className="flex justify-between items-center h-13">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white shadow-md shadow-emerald-500/10 flex-shrink-0">
                <Database className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xs sm:text-sm font-bold text-slate-900 font-display tracking-tight flex items-center gap-1.5 flex-wrap">
                  <span className="hidden sm:inline">品特烫金膜出入库管理与库存查询系统</span>
                  <span className="inline sm:hidden">品特烫金膜出入库系统</span>
                  <span className="text-[9px] bg-emerald-50 text-emerald-800 px-1 py-0.2 rounded border border-emerald-100 font-mono">
                    V1.2
                  </span>
                </h1>
                <p className="text-[8px] sm:text-[9px] text-slate-400 truncate max-w-[180px] sm:max-w-none">基于品特烫金膜每日流转统计与排位规范设计</p>
              </div>
            </div>

            {/* Global Quick Action (Hidden on mobile to save precious visual space) */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="text-xs text-slate-400 font-medium hidden sm:inline">数据呈现模式</span>
            </div>
          </div>
        </div>
      </header>

      {/* Month-Sheets Selection Bar */}
      <div className="bg-white border-b border-slate-200/60 py-2 shadow-2xs" id="month-sheets-selection-bar">
        <div className="w-full px-4 sm:px-6 md:px-8 flex items-center justify-between gap-4 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap flex items-center gap-1">
              <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">月度工作表 (Sheets):</span>
              <span className="inline sm:hidden">工作表:</span>
            </span>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none min-w-0">
              {monthsList.map((m) => {
                const isActive = m === currentMonth;
                const [y, mm] = m.split('-');
                return (
                  <button
                    key={m}
                    onClick={() => handleSwitchMonth(m)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all ${
                      isActive
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-800 shadow-3xs'
                        : 'bg-slate-50 hover:bg-slate-100 border border-slate-100 text-slate-600'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    {y}年{mm}月 工作表
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <main className="w-full px-4 sm:px-6 md:px-8 mt-4 space-y-4">
        {/* Navigation Tabs bar */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-px" id="navigation-tabs-bar">
          <div className="flex space-x-1 overflow-x-auto scrollbar-none pb-px w-full">
            <button
              onClick={() => {
                setActiveTab('query');
                setSelectedShelf(null);
              }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-t-lg text-xs font-semibold transition-all border-b-2 ${
                activeTab === 'query'
                  ? 'border-emerald-600 text-emerald-700 bg-white shadow-2xs'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/60'
              }`}
              id="tab-query-btn"
            >
              <Search className="w-3.5 h-3.5" />
              库存智能查询
            </button>

            <button
              onClick={() => {
                setActiveTab('table');
                setSelectedShelf(null);
              }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-t-lg text-xs font-semibold transition-all border-b-2 ${
                activeTab === 'table'
                  ? 'border-emerald-600 text-emerald-700 bg-white shadow-2xs'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/60'
              }`}
              id="tab-table-btn"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              在库统计表 (经典查询)
            </button>

            <button
              onClick={() => {
                setActiveTab('visual');
                setSelectedShelf(null);
              }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-t-lg text-xs font-semibold transition-all border-b-2 ${
                activeTab === 'visual'
                  ? 'border-emerald-600 text-emerald-700 bg-white shadow-2xs'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/60'
              }`}
              id="tab-visual-btn"
            >
              <Grid className="w-3.5 h-3.5" />
              19号货架平面看板 (可视化)
            </button>

            <button
              onClick={() => {
                setActiveTab('previous_month');
                setSelectedShelf(null);
              }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-t-lg text-xs font-semibold transition-all border-b-2 ${
                activeTab === 'previous_month'
                  ? 'border-emerald-600 text-emerald-700 bg-white shadow-2xs'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/60'
              }`}
              id="tab-previous-month-btn"
            >
              <Layers className="w-3.5 h-3.5" />
              上月结余 (对账校准)
            </button>

            <button
              onClick={() => {
                setActiveTab('timeline');
                setSelectedShelf(null);
              }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-t-lg text-xs font-semibold transition-all border-b-2 ${
                activeTab === 'timeline'
                  ? 'border-emerald-600 text-emerald-700 bg-white shadow-2xs'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/60'
              }`}
              id="tab-timeline-btn"
            >
              <Clock className="w-3.5 h-3.5" />
              时间尺度看板 (回溯)
            </button>

            <button
              onClick={() => setActiveTab('logs')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-t-lg text-xs font-semibold transition-all border-b-2 ${
                activeTab === 'logs'
                  ? 'border-emerald-600 text-emerald-700 bg-white shadow-2xs'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/60'
              }`}
              id="tab-logs-btn"
            >
              <History className="w-3.5 h-3.5" />
              操作流水变动日志
            </button>

            <button
              onClick={() => setActiveTab('management')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-t-lg text-xs font-semibold transition-all border-b-2 ${
                activeTab === 'management'
                  ? 'border-emerald-600 text-emerald-700 bg-white shadow-2xs'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/60'
              }`}
              id="tab-management-btn"
            >
              <Database className="w-3.5 h-3.5" />
              系统备份管理
            </button>
          </div>
          
          <div className="text-[10px] text-slate-400 font-mono hidden sm:block">
            系统时间: 2026-07-18
          </div>
        </div>

        {/* Dynamic View switching */}
        <div className="space-y-4">
          {activeTab === 'query' && (
            <div className="space-y-4 animate-fade-in">
              <InventoryQueryConsole
                batches={batches}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                selectedWarningFilter={selectedWarningFilter}
                setSelectedWarningFilter={setSelectedWarningFilter}
                selectedStockLevelFilter={selectedStockLevelFilter}
                setSelectedStockLevelFilter={setSelectedStockLevelFilter}
              />
              <InventoryCards
                batches={filteredQueryBatches}
                searchQuery={searchQuery}
              />
            </div>
          )}

          {activeTab === 'table' && (
            <div className="space-y-4 animate-fade-in">
              {/* Stats overview */}
              <StatsDashboard
                batches={batches}
                selectedWarningFilter={selectedWarningFilter}
                onSelectWarningFilter={setSelectedWarningFilter}
                selectedStockLevelFilter={selectedStockLevelFilter}
                setSelectedStockLevelFilter={setSelectedStockLevelFilter}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                selectedShelf={selectedShelf}
                setSelectedShelf={setSelectedShelf}
                sortBy={sortBy}
                setSortBy={setSortBy}
              />

              {/* Main table */}
              <InventoryTable
                batches={batches}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                selectedShelf={selectedShelf}
                setSelectedShelf={setSelectedShelf}
                selectedWarningFilter={selectedWarningFilter}
                selectedStockLevelFilter={selectedStockLevelFilter}
                sortBy={sortBy}
              />
            </div>
          )}

          {activeTab === 'visual' && (
            <div className="space-y-4 animate-fade-in">
              <ShelfVisualizer
                batches={batches}
                selectedShelf={selectedShelf}
                onSelectShelf={setSelectedShelf}
                onQuickTransaction={(batch, type) => setTransactionTarget({ batch, type })}
                searchQuery={searchQuery}
                selectedWarningFilter={selectedWarningFilter}
                selectedStockLevelFilter={selectedStockLevelFilter}
              />

              {/* Synchronized Inventory table below map visualizer */}
              <InventoryTable
                batches={batches}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                selectedShelf={selectedShelf}
                setSelectedShelf={setSelectedShelf}
                selectedWarningFilter={selectedWarningFilter}
                selectedStockLevelFilter={selectedStockLevelFilter}
                sortBy={sortBy}
              />
            </div>
          )}

          {activeTab === 'previous_month' && (
            <div className="animate-fade-in">
              <PreviousMonthBalanceView
                currentMonth={currentMonth}
                monthsList={monthsList}
                currentBatches={batches}
              />
            </div>
          )}

          {activeTab === 'timeline' && (
            <div className="animate-fade-in">
              <TimeScaleView
                batches={batches}
                transactions={transactions}
                currentMonth={currentMonth}
              />
            </div>
          )}

          {activeTab === 'logs' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden"
              id="transactions-logs-section"
            >
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">系统操作流水变动日志</h3>
                  <p className="text-xs text-slate-500">记叙所有批次的创建、入库、出库流水以及其备注变更的历史记录</p>
                </div>
                <div className="px-2 py-1 rounded-md bg-slate-50 text-[10px] font-mono text-slate-400">
                  共计 {transactions.length} 条记录
                </div>
              </div>

              <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto no-scrollbar">
                {transactions.length > 0 ? (
                  transactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors text-xs"
                      id={`log-item-${tx.id}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-xl mt-0.5 ${
                          tx.type === 'in' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}>
                          {tx.type === 'in' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-800">
                              批次 {tx.batchCode}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                              tx.type === 'in'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}>
                              {tx.type === 'in' ? '入库' : '出库'} +{tx.qty} 支
                            </span>
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-sm font-mono">
                              指定: {tx.day}号 统计栏
                            </span>
                          </div>
                          <p className="text-slate-500 mt-1">{tx.notes || '无业务说明'}</p>
                          <div className="flex items-center gap-3 text-[10px] text-slate-400 font-mono mt-1.5">
                            <span>型号: {tx.productModel}</span>
                            <span>操作员: {tx.operator}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-[10px] text-slate-400 font-mono text-left sm:text-right self-start sm:self-center">
                        {new Date(tx.timestamp).toLocaleString('zh-CN', {
                          hour12: false,
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        })}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                    <History className="w-8 h-8 text-slate-300" />
                    <p className="text-sm font-medium">暂无变动日志流水</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'management' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in" id="backup-management-section">
              {/* Backups card */}
              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-indigo-50 text-indigo-700">
                    <Download className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">库存备份与导出</h3>
                    <p className="text-xs text-slate-500">将当前的在库明细、每日统计栏、操作日志完全导出为一份安全文件</p>
                  </div>
                </div>
                
                <p className="text-xs text-slate-600 leading-relaxed">
                  本系统采用完全离线自治机制（LocalStorage持久化存储），以规避因清除浏览器缓存而丢失统计数据。我们强烈建议您在每次盘库完成后，点击下方按钮导出并妥善保存备份。
                </p>

                <div className="pt-2">
                  <button
                    onClick={handleExportData}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-colors"
                    id="export-backup-btn"
                  >
                    <Download className="w-4 h-4" />
                    立即导出备份文件 (.json)
                  </button>
                </div>
              </div>

              {/* Restore card */}
              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-sky-50 text-sky-700">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">导入状态与重置</h3>
                    <p className="text-xs text-slate-500">从之前保存的备份文件中恢复数据，或者彻底清空系统变动</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* File Upload Input */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                      导入历史备份文件
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleImportData}
                        className="text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                        id="import-backup-file-input"
                      />
                    </div>
                  </div>

                  {/* Reset to seed */}
                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      系统灾难恢复与归档
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleResetData}
                        className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-100 text-xs font-semibold transition-colors"
                        id="reset-original-seed-btn"
                      >
                        <RotateCcw className="w-4 h-4" />
                        彻底重置为 Excel 初始数据
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Global Modals container */}
      <AnimatePresence>
        {isAddBatchOpen && (
          <AddBatchModal
            isOpen={isAddBatchOpen}
            onClose={() => setIsAddBatchOpen(false)}
            onSubmit={handleAddBatch}
          />
        )}

        {transactionTarget && (
          <TransactionModal
            batch={transactionTarget.batch}
            type={transactionTarget.type}
            onClose={() => setTransactionTarget(null)}
            onSubmit={handleTransactionSubmit}
          />
        )}

        {isCreateMonthOpen && (
          <div className="fixed inset-0 bg-slate-900/65 flex items-center justify-center z-50 p-4 backdrop-blur-xs" id="create-month-modal-backdrop">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl border border-slate-100 shadow-2xl w-full max-w-md overflow-hidden"
              id="create-month-modal-card"
            >
              <div className="p-5 flex items-center justify-between border-b border-slate-100 bg-emerald-50/40">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800 font-sans">新建月度工作表 / 结转下月</h3>
                    <p className="text-[11px] text-slate-500">创建单独月份工作表，支持期末库存自动结转</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsCreateMonthOpen(false)}
                  className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">选择年份</label>
                    <select
                      value={newMonthYear}
                      onChange={(e) => setNewMonthYear(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-semibold"
                    >
                      <option value="2025">2025 年</option>
                      <option value="2026">2026 年</option>
                      <option value="2027">2027 年</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">选择月份</label>
                    <select
                      value={newMonthVal}
                      onChange={(e) => setNewMonthVal(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-semibold font-mono"
                    >
                      {['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map((m) => (
                        <option key={m} value={m}>{m} 月</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">数据初始化模式</label>
                  
                  <div
                    onClick={() => setNewMonthMode('rollover')}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                      newMonthMode === 'rollover'
                        ? 'bg-emerald-50/40 border-emerald-500/60 shadow-xs'
                        : 'bg-white border-slate-200 hover:bg-slate-50/50'
                    }`}
                  >
                    <input
                      type="radio"
                      checked={newMonthMode === 'rollover'}
                      onChange={() => setNewMonthMode('rollover')}
                      className="mt-1 accent-emerald-600"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">自动结转上月库存 (推荐)</span>
                      <span className="text-[10px] text-slate-500 leading-relaxed block mt-0.5">
                        自动复制当前选中月份 ({currentMonth}) 的所有在库批次，并将其期末库存作为新工作表的期初结转数 (Day 1 自动入库)，方便连续账期盘点。
                      </span>
                    </div>
                  </div>

                  <div
                    onClick={() => setNewMonthMode('empty')}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                      newMonthMode === 'empty'
                        ? 'bg-emerald-50/40 border-emerald-500/60 shadow-xs'
                        : 'bg-white border-slate-200 hover:bg-slate-50/50'
                    }`}
                  >
                    <input
                      type="radio"
                      checked={newMonthMode === 'empty'}
                      onChange={() => setNewMonthMode('empty')}
                      className="mt-1 accent-emerald-600"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">空白全新工作表</span>
                      <span className="text-[10px] text-slate-500 leading-relaxed block mt-0.5">
                        不继承任何已在库的批次数据，创建一个空白、干净的全新月份记录表。
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsCreateMonthOpen(false)}
                    className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 text-xs font-semibold transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => handleCreateMonth(newMonthYear, newMonthVal, newMonthMode)}
                    className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                  >
                    确认创建工作表
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

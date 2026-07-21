import React, { useState } from 'react';
import { InventoryBatch } from '../types';
import { motion } from 'motion/react';
import { X, ArrowUpRight, ArrowDownRight, ShieldCheck, User, Calendar, BookOpen } from 'lucide-react';
import { useLocalStorageState } from '../hooks/useLocalStorageState';

interface TransactionModalProps {
  batch: InventoryBatch | null;
  type: 'in' | 'out' | null;
  onClose: () => void;
  onSubmit: (data: {
    batchId: string;
    type: 'in' | 'out';
    qty: number;
    day: number;
    operator: string;
    notes: string;
  }) => void;
}

export default function TransactionModal({
  batch,
  type,
  onClose,
  onSubmit,
}: TransactionModalProps) {
  if (!batch || !type) return null;

  const [qty, setQty] = useLocalStorageState<number>(
    'storage_foil_pref_v1_transaction_quantity',
    1,
  );
  const [day, setDay] = useLocalStorageState<number>(
    'storage_foil_pref_v1_transaction_day',
    1,
  );
  const [operator, setOperator] = useLocalStorageState(
    'storage_foil_pref_v1_transaction_operator',
    '仓库操作员',
  );
  const [notes, setNotes] = useState<string>('');
  const [error, setError] = useState<string>('');

  const handleQtyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    setError('');
    
    if (isNaN(value)) {
      setQty(0);
      return;
    }

    if (type === 'out' && value > batch.totalStock) {
      setError(`出库数量不能大于当前在库库存 (${batch.totalStock}支)`);
    }

    setQty(value);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (qty <= 0) {
      setError('请输入有效数量 (大于0)');
      return;
    }
    if (type === 'out' && qty > batch.totalStock) {
      setError(`出库数量不能大于当前在库库存 (${batch.totalStock}支)`);
      return;
    }

    onSubmit({
      batchId: batch.id,
      type,
      qty,
      day,
      operator,
      notes,
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/65 flex items-center justify-center z-50 p-4 backdrop-blur-xs" id="transaction-modal-backdrop">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-3xl border border-slate-100 shadow-2xl w-full max-w-lg overflow-hidden"
        id="transaction-modal-card"
      >
        {/* Modal Header */}
        <div className={`p-5 flex items-center justify-between border-b border-slate-100 ${
          type === 'in' ? 'bg-emerald-50/50' : 'bg-rose-50/50'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${
              type === 'in' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
            }`}>
              {type === 'in' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800 font-sans">
                {type === 'in' ? '产品快捷入库登记' : '产品快捷出库登记'}
              </h3>
              <p className="text-[11px] text-slate-500 font-mono">批次代码: {batch.batchCode}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
            id="close-transaction-modal-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
          {/* Product Specs Read-only */}
          <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200/50 font-mono text-xs text-slate-600">
            <div>
              <span className="text-[10px] text-slate-400 block font-sans">产品规格</span>
              <span className="font-semibold text-slate-700">{batch.specification}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block font-sans">存放架位</span>
              <span className="font-semibold text-slate-700">{batch.shelf}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block font-sans">当前在库数</span>
              <span className="font-bold text-emerald-700">{batch.totalStock} 支</span>
            </div>
          </div>

          {/* Form Fields */}
          <div className="space-y-3">
            {/* Quantity */}
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                {type === 'in' ? '入库数量 (支)' : '出库数量 (支)'} <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                max={type === 'out' ? batch.totalStock : undefined}
                value={qty || ''}
                onChange={handleQtyChange}
                required
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold font-mono text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                id="transaction-qty-input"
              />
              {error && <p className="text-[11px] text-rose-500 mt-1 font-medium">{error}</p>}
            </div>

            {/* Day Number Select (1 to 5) */}
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mb-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                登记者日期编号 (统计表所属天数)
              </label>
              <select
                value={day}
                onChange={(e) => setDay(parseInt(e.target.value, 10))}
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                id="transaction-day-select"
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d}号 统计栏
                  </option>
                ))}
              </select>
            </div>

            {/* Operator */}
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mb-1">
                <User className="w-3.5 h-3.5 text-slate-400" />
                经办人
              </label>
              <input
                type="text"
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
                required
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                id="transaction-operator-input"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mb-1">
                <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                业务说明 (非必填)
              </label>
              <textarea
                placeholder="例如: 某某客户提货、生产余料退库、检测用样等"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                id="transaction-notes-input"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 text-sm font-semibold transition-colors"
              id="transaction-cancel-btn"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!!error || qty <= 0}
              className={`flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                type === 'in'
                  ? 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300'
                  : 'bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300'
              }`}
              id="transaction-submit-btn"
            >
              <ShieldCheck className="w-4 h-4" />
              提交登记
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

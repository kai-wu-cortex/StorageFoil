import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Plus, Clipboard, Tag, Calendar, User, AlignLeft } from 'lucide-react';

interface AddBatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    productModel: string;
    batchCode: string;
    specification: string;
    shelf: string;
    initialQty: number;
    remarks: string;
    operator: string;
  }) => void;
}

export default function AddBatchModal({ isOpen, onClose, onSubmit }: AddBatchModalProps) {
  if (!isOpen) return null;

  const [productModel, setProductModel] = useState('品特');
  const [batchCode, setBatchCode] = useState('');
  const [specification, setSpecification] = useState('0.64*120M');
  const [shelf, setShelf] = useState('19-3A');
  const [initialQty, setInitialQty] = useState<number>(10);
  const [remarks, setRemarks] = useState('');
  const [operator, setOperator] = useState('仓库管理员');
  const [error, setError] = useState('');

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchCode.trim()) {
      setError('请输入产品批次编号');
      return;
    }
    if (initialQty <= 0) {
      setError('入库数量必须大于0');
      return;
    }

    onSubmit({
      productModel,
      batchCode: batchCode.trim(),
      specification,
      shelf: shelf.trim().toUpperCase(),
      initialQty,
      remarks: remarks.trim(),
      operator: operator.trim(),
    });

    // Reset fields
    setBatchCode('');
    setRemarks('');
  };

  return (
    <div className="fixed inset-0 bg-slate-900/65 flex items-center justify-center z-50 p-4 backdrop-blur-xs" id="add-batch-modal-backdrop">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-3xl border border-slate-100 shadow-2xl w-full max-w-xl overflow-hidden"
        id="add-batch-modal-card"
      >
        {/* Header */}
        <div className="p-5 flex items-center justify-between border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800 font-sans">
                新增产品入库登记
              </h3>
              <p className="text-[11px] text-slate-500">向出入库系统添加全新的一批原材料/成品</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
            id="close-add-batch-modal-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleFormSubmit} className="p-6 space-y-4 max-h-[500px] overflow-y-auto no-scrollbar">
          {error && (
            <div className="p-3 bg-rose-50 text-rose-700 text-xs rounded-xl border border-rose-100 font-medium">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Product Model */}
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mb-1">
                <Tag className="w-3.5 h-3.5 text-slate-400" />
                产品型号 <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={productModel}
                onChange={(e) => setProductModel(e.target.value)}
                required
                placeholder="例如: 品特"
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                id="add-batch-model"
              />
            </div>

            {/* Product Batch */}
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mb-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                产品批次 <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={batchCode}
                onChange={(e) => {
                  setError('');
                  setBatchCode(e.target.value);
                }}
                required
                placeholder="例如: 20260718"
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold font-mono focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                id="add-batch-code"
              />
            </div>

            {/* Specification */}
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mb-1">
                <Clipboard className="w-3.5 h-3.5 text-slate-400" />
                产品规格 <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={specification}
                onChange={(e) => setSpecification(e.target.value)}
                required
                placeholder="例如: 0.64*120M"
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                id="add-batch-spec"
              />
            </div>

            {/* Shelf */}
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mb-1">
                <MapPinIcon className="w-3.5 h-3.5 text-slate-400" />
                存放货架架位 <span className="text-rose-500">*</span>
              </label>
              <select
                value={shelf}
                onChange={(e) => setShelf(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-mono text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                id="add-batch-shelf"
              >
                <option value="19-1A">19-1A (Section 1 Level A)</option>
                <option value="19-1C">19-1C (Section 1 Level C)</option>
                <option value="19-3A">19-3A (Section 3 Level A)</option>
                <option value="19-4C">19-4C (Section 4 Level C)</option>
                <option value="19-5C">19-5C (Section 5 Level C)</option>
              </select>
            </div>

            {/* Initial Inflow Qty */}
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mb-1">
                入库总数量 (支) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                value={initialQty || ''}
                onChange={(e) => setInitialQty(parseInt(e.target.value, 10))}
                required
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold font-mono focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                id="add-batch-qty"
              />
            </div>

            {/* Operator */}
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mb-1">
                <User className="w-3.5 h-3.5 text-slate-400" />
                入库经办人
              </label>
              <input
                type="text"
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
                required
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                id="add-batch-operator"
              />
            </div>
          </div>

          {/* Remarks */}
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mb-1">
              <AlignLeft className="w-3.5 h-3.5 text-slate-400" />
              特殊工艺或异常备注 (可选)
            </label>
            <input
              type="text"
              placeholder="例如: 白边、全部有麻点、胶底不一样、咖啡底"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              id="add-batch-remarks"
            />
          </div>

          <div className="p-3 bg-slate-50 text-[11px] text-slate-400 rounded-xl border border-slate-200/50">
            💡 提示: 新增的入库数量将自动记入每日流水的「1号」入库中，并且同步初始化在库库存总数。
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 text-sm font-semibold transition-colors"
              id="add-batch-cancel-btn"
            >
              取消
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-1.5"
              id="add-batch-submit-btn"
            >
              <Plus className="w-4 h-4" />
              创建并登记入库
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// Simple MapPin helper inside file to prevent dependencies issues
function MapPinIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

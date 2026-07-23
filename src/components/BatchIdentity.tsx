import type { ReactNode } from 'react';

interface BatchIdentityProps {
  productModel: ReactNode;
  batchCode: ReactNode;
  className?: string;
  itemClassName?: string;
  labelClassName?: string;
  valueClassName?: string;
}

export default function BatchIdentity({
  productModel,
  batchCode,
  className = '',
  itemClassName = '',
  labelClassName = '',
  valueClassName = '',
}: BatchIdentityProps) {
  return (
    <div className={`grid grid-cols-2 gap-3 ${className}`}>
      <div className={itemClassName}>
        <span className={labelClassName}>产品型号</span>
        <div data-batch-identity-value="model" className={valueClassName}>
          {productModel}
        </div>
      </div>
      <div className={itemClassName}>
        <span className={labelClassName}>产品批次</span>
        <div data-batch-identity-value="batch" className={valueClassName}>
          {batchCode}
        </div>
      </div>
    </div>
  );
}

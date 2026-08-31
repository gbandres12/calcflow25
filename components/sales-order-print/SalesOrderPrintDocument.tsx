import React from 'react';
import { Company, Customer, SaleOrder } from '../../types';
import { SO } from './theme';
import { SalesOrderHeader } from './SalesOrderHeader';
import { SalesOrderSummary } from './SalesOrderSummary';
import { CustomerAddresses } from './CustomerAddresses';
import { SalesOrderItemsTable } from './SalesOrderItemsTable';
import { SalesOrderTotals } from './SalesOrderTotals';
import { SalesOrderPayment } from './SalesOrderPayment';
import { SalesOrderObservations } from './SalesOrderObservations';
import { SalesOrderSignatures } from './SalesOrderSignatures';
import { SalesOrderFooter } from './SalesOrderFooter';

interface Props {
  order: SaleOrder;
  customer?: Customer;
  company: Company;
  printedAt: string;
}

export const SalesOrderPrintDocument: React.FC<Props> = ({
  order,
  customer,
  company,
  printedAt
}) => {
  const title = order.status === 'Orçamento' ? 'Orçamento' : 'Pedido de Venda';

  return (
    <article
      id="printable-sales-order"
      className="bg-white px-7 py-6"
      style={{ fontFamily: SO.font, color: SO.text }}
    >
      <SalesOrderHeader company={company} title={title} orderNumber={order.reference} />
      <div className="mt-3.5">
        <SalesOrderSummary order={order} customer={customer} />
      </div>
      <div className="mt-3.5">
        <CustomerAddresses customer={customer} />
      </div>
      <div className="mt-4">
        <SalesOrderItemsTable order={order} />
      </div>
      <div className="mt-3.5">
        <SalesOrderTotals order={order} />
      </div>
      <div className="mt-3.5">
        <SalesOrderPayment order={order} />
      </div>
      <div className="mt-3.5">
        <SalesOrderObservations order={order} />
      </div>
      <div className="mt-2">
        <SalesOrderSignatures />
      </div>
      <SalesOrderFooter printedAt={printedAt} />
    </article>
  );
};

import request from './request';

export interface OrderItem {
  id: number;
  productId: string;
  productName: string;
  productSku?: string | null;
  price: number;
  quantity: number;
  subtotal: number;
}

export interface OrderListItem {
  id: number;
  orderNo: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  totalAmount: number;
  payAmount: number;
  payMethod?: string | null;
  payStatus: number;
  orderStatus: number;
  shipNo?: string | null;
  shipCompany?: string | null;
  address?: string | null;
  remark?: string | null;
  paidAt?: string | null;
  shippedAt?: string | null;
  receivedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  refundedAt?: string | null;
  refundAmount?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderDetail extends OrderListItem {
  items: OrderItem[];
}

export interface OrderListParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  orderStatus?: number;
  payStatus?: number;
  startDate?: string;
  endDate?: string;
  minAmount?: number;
  maxAmount?: number;
}

export function listOrders(params: OrderListParams = {}) {
  return request.get<any, { list: OrderListItem[]; total: number; page: number; pageSize: number }>(
    '/orders',
    { params },
  );
}

export function getOrder(id: number) {
  return request.get<OrderDetail, OrderDetail>(`/orders/${id}`);
}

export interface CreateOrderDto {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  address?: string;
  payMethod?: 'wechat' | 'alipay' | 'bank';
  remark?: string;
  items: {
    productId: string;
    productName: string;
    productSku?: string;
    price: number;
    quantity: number;
  }[];
}

export function createOrder(data: CreateOrderDto) {
  return request.post('/orders', data);
}

export function updateOrder(id: number, data: Partial<CreateOrderDto>) {
  return request.put(`/orders/${id}`, data);
}

export interface UpdateOrderStatusDto {
  newStatus: number;
  shipNo?: string;
  shipCompany?: string;
}

export function updateStatus(id: number, dto: UpdateOrderStatusDto) {
  return request.put(`/orders/${id}/status`, dto);
}

export interface RefundDto {
  refundAmount: number;
  reason: string;
}

export function refund(id: number, dto: RefundDto) {
  return request.post(`/orders/${id}/refund`, dto);
}

export function exportOrdersUrl(params: OrderListParams = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) qs.append(k, String(v));
  });
  const base = '/api/orders/export';
  const query = qs.toString();
  return query ? `${base}?${query}` : base;
}

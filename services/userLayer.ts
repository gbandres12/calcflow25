// Compatibilidade para importações antigas. A autenticação e os perfis ficam
// centralizados no serviço que usa o Supabase Auth.
export {
  userService,
  financeService,
  inventoryService,
  orderService
} from './dataService';

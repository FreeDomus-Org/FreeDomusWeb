-- Productos "a ojo" (sal, especias, salsas, azúcar...): no se pesan ni se cuentan.
-- En el inventario se llevan por nivel (lleno / medio / poco / agotado) y al cocinar no se descuentan:
-- la app pregunta cómo quedaron.
begin;

alter table public.products
  add column if not exists tracking text not null default 'exact'
  constraint products_tracking_check check (tracking in ('exact', 'pantry'));

-- Solo tiene valor en productos 'pantry'; null en los que se cuentan o pesan
alter table public.inventory
  add column if not exists stock_level text
  constraint inventory_stock_level_check check (stock_level in ('lleno', 'medio', 'poco', 'agotado'));

update public.products
   set tracking = 'pantry'
 where category in ('Salsas', 'Especias', 'Azúcares')
    or name ~* '^(sal|pimienta|aceite|vinagre|azúcar|azucar|comino|orégano|oregano|canela|pimentón|pimenton|ajo en polvo|caldo en polvo|levadura|bicarbonato)\M';

-- Lo que ya había de esos productos empieza como "lleno"
update public.inventory i
   set stock_level = 'lleno'
  from public.products p
 where p.id = i.product_id
   and p.tracking = 'pantry'
   and i.stock_level is null;

commit;

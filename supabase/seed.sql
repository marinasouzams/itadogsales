-- ============================================================
-- ITA Dog Sales — Seed Data
-- ATENÇÃO: Execute APÓS o schema.sql
-- ATENÇÃO: Substitua os UUIDs abaixo pelos IDs reais criados
--          via Dashboard > Authentication > Users após criar
--          as contas de usuário.
-- ============================================================

-- ── PASSO 1: Crie os usuários no Dashboard Supabase ──────────
-- Vá em Authentication > Users > Invite user (ou Add user)
-- Crie os 5 usuários abaixo com as senhas indicadas:
--
--  admin@itasales.com.br  → senha: Admin@2025!   role: admin
--  carlos@itasales.com.br → senha: Rep@2025!     role: rep
--  ana@itasales.com.br    → senha: Rep@2025!     role: rep
--  roberto@itasales.com.br→ senha: Rep@2025!     role: rep
--  fernanda@itasales.com.br→senha: Rep@2025!     role: rep
--
-- Após criar, pegue os UUIDs no dashboard e substitua abaixo:
-- ──────────────────────────────────────────────────────────────

-- Exemplo de UUIDs (SUBSTITUA pelos reais):
-- admin-1   → 00000000-0000-0000-0000-000000000001
-- rep-1     → 00000000-0000-0000-0000-000000000002
-- rep-2     → 00000000-0000-0000-0000-000000000003
-- rep-3     → 00000000-0000-0000-0000-000000000004
-- rep-4     → 00000000-0000-0000-0000-000000000005

-- PERFIS (ajuste os UUIDs!)
insert into public.profiles (id, name, email, role, phone, region, territory, active, meta, meta_ating, created_at) values
  ('00000000-0000-0000-0000-000000000001','Marina Julia de Souza','admin@itasales.com.br','admin','(17) 99999-0001',null,'{}',true,null,null,'2024-01-10'),
  ('00000000-0000-0000-0000-000000000002','Carlos Eduardo Santos','carlos@itasales.com.br','rep','(17) 99123-4567','Norte SP',array['São José do Rio Preto','Votuporanga','Fernandópolis'],true,180000,142500,'2024-01-15'),
  ('00000000-0000-0000-0000-000000000003','Ana Paula Ferreira','ana@itasales.com.br','rep','(34) 99234-5678','Triângulo Mineiro',array['Uberlândia','Uberaba','Ituiutaba'],true,200000,187000,'2024-01-15'),
  ('00000000-0000-0000-0000-000000000004','Roberto Alves Costa','roberto@itasales.com.br','rep','(62) 99345-6789','Goiás Centro',array['Goiânia','Anápolis','Rio Verde'],true,160000,98000,'2024-02-01'),
  ('00000000-0000-0000-0000-000000000005','Fernanda Lima Souza','fernanda@itasales.com.br','rep','(67) 99456-7890','Mato Grosso do Sul',array['Campo Grande','Dourados','Três Lagoas'],true,220000,215000,'2024-02-10')
on conflict (id) do update set
  name = excluded.name, role = excluded.role,
  phone = excluded.phone, region = excluded.region,
  territory = excluded.territory, active = excluded.active,
  meta = excluded.meta, meta_ating = excluded.meta_ating;

-- PRODUTOS
insert into public.products (id, code, name, category, price, unit, stock, bling_id) values
  ('prod-1','HERB001','Herbicida Roundup Original','Defensivos',89.90,'L',450,'bling-001'),
  ('prod-2','FERT001','Fertilizante NPK 10-10-10 50kg','Fertilizantes',145.00,'sc',820,'bling-002'),
  ('prod-3','SEED001','Semente Soja TMG 7062 IPRO 40kg','Sementes',380.00,'sc',1200,'bling-003'),
  ('prod-4','FUNG001','Fungicida Priori Xtra 500ml','Defensivos',198.50,'un',230,'bling-004'),
  ('prod-5','INSE001','Inseticida Engeo Pleno 250ml','Defensivos',156.00,'un',310,'bling-005'),
  ('prod-6','FERT002','Ureia Granulada 50kg','Fertilizantes',168.00,'sc',640,'bling-006'),
  ('prod-7','VET001','Ivermectina 1% 500ml Injetável','Veterinário',42.90,'un',185,'bling-007'),
  ('prod-8','VET002','Vacina Aftosa Dose Única','Veterinário',4.50,'dose',5000,'bling-008'),
  ('prod-9','SEED002','Semente Milho DKB 177 PRO3 60k','Sementes',420.00,'sc',780,'bling-009'),
  ('prod-10','FERT003','Calcário Dolomítico 30kg','Corretivos',28.00,'sc',2400,'bling-010'),
  ('prod-11','HERB002','Herbicida Select 240ml','Defensivos',124.00,'un',190,'bling-011'),
  ('prod-12','NUTR001','Nutrição Animal Confinamento 30kg','Nutrição Animal',95.00,'sc',920,'bling-012')
on conflict (id) do nothing;

-- CLIENTES
insert into public.clients (id,name,trade_name,cnpj,type,rep_id,address,phone,email,status,segment,last_visit,last_order,total_orders,total_revenue,priority,created_at) values
  ('cli-1','Agropecuária Santa Fé Ltda','Santa Fé Agro','12.345.678/0001-90','agropecuaria','00000000-0000-0000-0000-000000000002','{"street":"Rod. SP-310 km 12","city":"São José do Rio Preto","state":"SP","zipCode":"15015-000","lat":-20.8197,"lng":-49.3794}','(17) 99801-2233','santafe@agro.com.br','ativo','Soja / Milho','2025-04-28','2025-04-15',47,523400.00,'alta','2020-03-15'),
  ('cli-2','Fazenda Boa Esperança',null,'23.456.789/0001-01','fazenda','00000000-0000-0000-0000-000000000002','{"street":"Zona Rural s/n","city":"Mirassol","state":"SP","zipCode":"15130-000","lat":-20.4225,"lng":-49.9706}','(17) 99312-4455','boa.esperanca@gmail.com','ativo','Pecuária / Leite','2025-03-10','2025-03-08',18,142800.00,'media','2021-07-20'),
  ('cli-3','Cooperativa Agro Vale Verde',null,'34.567.890/0001-12','cooperativa','00000000-0000-0000-0000-000000000002','{"street":"Av. Brasil, 500","city":"Bady Bassitt","state":"SP","zipCode":"15145-000","lat":-20.2837,"lng":-50.2455}','(17) 3342-8899','gerencia@valeverde.coop.br','ativo','Cooperativa','2025-05-05','2025-05-01',134,1870000.00,'alta','2019-06-10'),
  ('cli-4','Distribuidora Campos Verdes',null,'45.678.901/0001-23','distribuidor','00000000-0000-0000-0000-000000000002','{"street":"Rua das Indústrias, 300","city":"Catanduva","state":"SP","zipCode":"15800-000","lat":-21.1365,"lng":-48.9750}','(17) 3522-7766','compras@camposverdes.com.br','ativo','Insumos Agro','2025-05-10',null,23,98500.00,'media','2022-01-05'),
  ('cli-5','Revendedor Agro Norte',null,'56.789.012/0001-34','revendedor','00000000-0000-0000-0000-000000000002','{"street":"Av. Bady Bassitt, 1200","city":"São José do Rio Preto","state":"SP","zipCode":"15025-000","lat":-20.8310,"lng":-49.3600}','(17) 3218-5544',null,'inativo','Revendas',null,null,5,21000.00,'baixa','2023-02-14'),
  ('cli-6','Agropecuária Cerrado Sul',null,'67.890.123/0001-45','agropecuaria','00000000-0000-0000-0000-000000000003','{"street":"Rod. BR-050 km 98","city":"Uberaba","state":"MG","zipCode":"38001-000","lat":-19.7478,"lng":-47.9311}','(34) 99445-6677','cerradosul@agro.com.br','ativo','Grãos / Pecuária','2025-05-03','2025-04-28',62,680000.00,'alta','2020-09-01'),
  ('cli-7','Fazenda Vista Linda',null,'78.901.234/0001-56','fazenda','00000000-0000-0000-0000-000000000003','{"street":"Zona Rural km 5","city":"Uberlândia","state":"MG","zipCode":"38401-000","lat":-18.9186,"lng":-48.2772}','(34) 99556-7788',null,'ativo','Soja / Milho','2025-04-20','2025-04-18',29,215000.00,'media','2021-04-22'),
  ('cli-8','Grupo Agro Goiás Central',null,'89.012.345/0001-67','cooperativa','00000000-0000-0000-0000-000000000004','{"street":"Av. Anhanguera, 4500","city":"Goiânia","state":"GO","zipCode":"74000-000","lat":-16.6799,"lng":-49.2550}','(62) 3201-9988','diretoria@agrogoias.com.br','ativo','Cooperativa','2025-04-10','2025-04-05',88,950000.00,'alta','2019-11-30'),
  ('cli-9','Fazenda Planalto Verde',null,'90.123.456/0001-78','fazenda','00000000-0000-0000-0000-000000000005','{"street":"Zona Rural s/n","city":"Dourados","state":"MS","zipCode":"79800-000","lat":-22.2211,"lng":-54.8058}','(67) 99521-3344','planalto@gmail.com','ativo','Soja / Milho','2025-05-06','2025-04-30',89,748900.00,'alta','2021-03-12'),
  ('cli-10','Cooperativa MS Sul',null,'01.234.567/0001-89','cooperativa','00000000-0000-0000-0000-000000000005','{"street":"Av. Marcelino Pires, 1800","city":"Dourados","state":"MS","zipCode":"79801-000","lat":-22.2284,"lng":-54.8122}','(67) 3425-6677',null,'ativo','Cooperativa','2025-04-15','2025-04-12',156,1240000.00,'alta','2020-08-20')
on conflict (id) do nothing;

-- PEDIDOS
insert into public.orders (id,number,client_id,client_name,client_city,rep_id,rep_name,status,sync_status,items,subtotal,discount,total,payment_terms,delivery_date,bling_order_id,created_at,updated_at) values
  ('ord-1','PED-2025-0412','cli-1','Agropecuária Santa Fé Ltda','São José do Rio Preto','00000000-0000-0000-0000-000000000002','Carlos Eduardo Santos','faturado','sincronizado','[{"productId":"prod-1","productName":"Herbicida Roundup Original","quantity":50,"price":89.90,"discount":5,"total":4270.25},{"productId":"prod-2","productName":"Fertilizante NPK 10-10-10 50kg","quantity":100,"price":145.00,"discount":8,"total":13340.00}]',17610.25,1200,16410.25,'30/60/90 dias','2025-04-22','BLING-9821','2025-04-15T09:30:00','2025-04-16T14:00:00'),
  ('ord-2','PED-2025-0387','cli-3','Cooperativa Agro Vale Verde','Bady Bassitt','00000000-0000-0000-0000-000000000002','Carlos Eduardo Santos','aprovado','sincronizado','[{"productId":"prod-3","productName":"Semente Soja TMG 7062 IPRO","quantity":200,"price":380.00,"discount":10,"total":68400.00},{"productId":"prod-9","productName":"Semente Milho DKB 177","quantity":80,"price":420.00,"discount":8,"total":30912.00}]',99312.00,5000,94312.00,'Boleto 60 dias','2025-05-10','BLING-9876','2025-05-01T11:00:00','2025-05-02T08:30:00'),
  ('ord-3','PED-2025-0401','cli-2','Fazenda Boa Esperança','Mirassol','00000000-0000-0000-0000-000000000002','Carlos Eduardo Santos','enviado','pendente','[{"productId":"prod-7","productName":"Ivermectina 1% 500ml","quantity":40,"price":42.90,"discount":0,"total":1716.00},{"productId":"prod-8","productName":"Vacina Aftosa","quantity":500,"price":4.50,"discount":5,"total":2137.50}]',3853.50,0,3853.50,'À vista',null,null,'2025-05-08T14:20:00','2025-05-08T14:20:00'),
  ('ord-4','PED-2025-0415','cli-9','Fazenda Planalto Verde','Dourados','00000000-0000-0000-0000-000000000005','Fernanda Lima Souza','aprovado','sincronizado','[{"productId":"prod-3","productName":"Semente Soja TMG 7062 IPRO","quantity":400,"price":380.00,"discount":12,"total":133760.00},{"productId":"prod-2","productName":"Fertilizante NPK 10-10-10 50kg","quantity":300,"price":145.00,"discount":10,"total":39150.00}]',172910.00,8000,164910.00,'30/60/90/120 dias','2025-05-15','BLING-9890','2025-04-30T10:00:00','2025-05-01T09:00:00'),
  ('ord-5','PED-2025-0421','cli-6','Agropecuária Cerrado Sul','Uberaba','00000000-0000-0000-0000-000000000003','Ana Paula Ferreira','faturado','sincronizado','[{"productId":"prod-4","productName":"Fungicida Priori Xtra","quantity":60,"price":198.50,"discount":5,"total":11314.50},{"productId":"prod-5","productName":"Inseticida Engeo Pleno","quantity":80,"price":156.00,"discount":5,"total":11856.00},{"productId":"prod-6","productName":"Ureia Granulada 50kg","quantity":150,"price":168.00,"discount":8,"total":23184.00}]',46354.50,2000,44354.50,'30/60 dias','2025-05-08','BLING-9901','2025-04-28T09:15:00','2025-04-29T11:00:00'),
  ('ord-6','PED-2025-0425','cli-1','Agropecuária Santa Fé Ltda','São José do Rio Preto','00000000-0000-0000-0000-000000000002','Carlos Eduardo Santos','rascunho','pendente','[{"productId":"prod-11","productName":"Herbicida Select","quantity":30,"price":124.00,"discount":0,"total":3720.00}]',3720.00,0,3720.00,null,null,null,'2025-05-09T16:30:00','2025-05-09T16:30:00'),
  ('ord-7','PED-2025-0398','cli-1','Agropecuária Santa Fé Ltda','São José do Rio Preto','00000000-0000-0000-0000-000000000002','Carlos Eduardo Santos','pronto_entrega','sincronizado','[{"productId":"prod-1","productName":"Herbicida Roundup Original","quantity":20,"price":89.90,"discount":0,"total":1798.00}]',1798.00,0,1798.00,'À vista','2025-05-12','BLING-9920','2025-05-07T10:00:00','2025-05-09T08:00:00'),
  ('ord-8','PED-2025-0410','cli-3','Cooperativa Agro Vale Verde','Bady Bassitt','00000000-0000-0000-0000-000000000002','Carlos Eduardo Santos','pronto_entrega','sincronizado','[{"productId":"prod-6","productName":"Ureia Granulada 50kg","quantity":50,"price":168.00,"discount":5,"total":7980.00}]',7980.00,0,7980.00,'30 dias','2025-05-13','BLING-9921','2025-05-08T09:00:00','2025-05-10T07:00:00')
on conflict (id) do nothing;

-- VISITAS
insert into public.visits (id,client_id,client_name,client_city,rep_id,rep_name,status,check_in,check_out,result,notes,rating,next_visit,duration,order_id,created_at) values
  ('vis-1','cli-1','Agropecuária Santa Fé Ltda','São José do Rio Preto','00000000-0000-0000-0000-000000000002','Carlos Eduardo Santos','concluida','{"lat":-20.8197,"lng":-49.3794,"timestamp":"2025-04-28T09:15:00"}','{"lat":-20.8197,"lng":-49.3794,"timestamp":"2025-04-28T11:30:00"}','positivo','Cliente muito interessado na linha de fungicidas. Demonstração do novo produto Priori Xtra.',5,'2025-05-19',135,'ord-1','2025-04-28T09:00:00'),
  ('vis-2','cli-3','Cooperativa Agro Vale Verde','Bady Bassitt','00000000-0000-0000-0000-000000000002','Carlos Eduardo Santos','concluida','{"lat":-20.2837,"lng":-50.2455,"timestamp":"2025-05-05T14:00:00"}','{"lat":-20.2837,"lng":-50.2455,"timestamp":"2025-05-05T16:45:00"}','positivo','Reunião com gerente Sérgio. Fechou pedido grande de sementes para safra 25/26.',5,'2025-05-26',165,'ord-2','2025-05-05T13:45:00'),
  ('vis-3','cli-2','Fazenda Boa Esperança','Mirassol','00000000-0000-0000-0000-000000000002','Carlos Eduardo Santos','concluida','{"lat":-20.4225,"lng":-49.9706,"timestamp":"2025-03-10T10:00:00"}','{"lat":-20.4225,"lng":-49.9706,"timestamp":"2025-03-10T11:45:00"}','neutro','Dono não estava. Falou com funcionário. Deixou catálogo. Retornar em 2 semanas.',3,'2025-05-15',105,null,'2025-03-10T09:45:00'),
  ('vis-4','cli-6','Agropecuária Cerrado Sul','Uberaba','00000000-0000-0000-0000-000000000003','Ana Paula Ferreira','concluida','{"lat":-18.9186,"lng":-48.2772,"timestamp":"2025-05-03T09:00:00"}','{"lat":-18.9186,"lng":-48.2772,"timestamp":"2025-05-03T11:00:00"}','positivo','Apresentação da linha defensivos safra inverno. Cliente confirmou pedido.',5,'2025-05-24',120,'ord-5','2025-05-03T08:45:00'),
  ('vis-5','cli-9','Fazenda Planalto Verde','Dourados','00000000-0000-0000-0000-000000000005','Fernanda Lima Souza','concluida','{"lat":-22.2211,"lng":-54.8058,"timestamp":"2025-05-06T08:30:00"}','{"lat":-22.2211,"lng":-54.8058,"timestamp":"2025-05-06T10:45:00"}','positivo','Fechamento do maior pedido do ano. Proprietário muito satisfeito.',5,'2025-05-20',135,'ord-4','2025-05-06T08:00:00'),
  ('vis-6','cli-4','Distribuidora Campos Verdes','Catanduva','00000000-0000-0000-0000-000000000002','Carlos Eduardo Santos','agendada',null,null,null,null,null,'2025-05-12',null,null,'2025-05-08T16:00:00')
on conflict (id) do nothing;

-- PROSPECTS
insert into public.prospects (id,name,contact,phone,email,city,state,region,segment,status,rep_id,rep_name,notes,source,estimated_revenue,attempts,created_at) values
  ('pro-1','Fazenda Rio Claro','Marcos Rodrigues','(17) 99611-2233',null,'São José do Rio Preto','SP','Norte SP','Soja / Milho','disponivel',null,null,null,'Indicação cliente',45000,0,'2025-04-20'),
  ('pro-2','Agropecuária Irmãos Mendes','Paulo Mendes','(17) 98722-4455','paulo@mendesagro.com.br','Catanduva','SP','Norte SP','Insumos / Veterinário','assumido','00000000-0000-0000-0000-000000000002','Carlos Eduardo Santos','Contatei dia 01/05. Interesse em defensivos e fertilizantes.','Feira AgriShow 2025',80000,2,'2025-04-25'),
  ('pro-3','Fazenda Santa Luzia','João Carlos Neto','(34) 99345-8877',null,'Patos de Minas','MG','Triângulo Mineiro','Pecuária / Leite','disponivel',null,null,null,'Prospecção ativa',32000,0,'2025-05-01'),
  ('pro-4','Cooperativa Agro Minas Centro','Diretoria','(31) 3312-6655','diretoria@agrominas.coop.br','Sete Lagoas','MG',null,'Cooperativa','disponivel',null,null,null,'LinkedIn',180000,0,'2025-04-15'),
  ('pro-5','Rancho Bela Vista','Antônio Carvalho','(62) 99211-7766',null,'Rio Verde','GO','Goiás Centro','Grãos / Pecuária','assumido','00000000-0000-0000-0000-000000000004','Roberto Alves Costa','Falamos por telefone. Interesse real. Visita marcada para 12/05.','Indicação',55000,3,'2025-04-28'),
  ('pro-6','Fazenda Esperança Viva','Ricardo Dutra','(67) 99712-3300',null,'Maracaju','MS','Mato Grosso do Sul','Soja / Trigo','convertido','00000000-0000-0000-0000-000000000005','Fernanda Lima Souza',null,null,120000,5,'2025-03-10'),
  ('pro-7','Agrostore Primavera','Fernanda Castro','(65) 99823-4411',null,'Sorriso','MT',null,'Revenda Agro','disponivel',null,null,null,'Indicação parceiro',95000,0,'2025-05-05')
on conflict (id) do nothing;

-- COMISSÕES
insert into public.commissions (id,rep_id,rep_name,order_id,order_number,client_name,client_id,order_total,rate,amount,status,reference_month,paid_at,created_at) values
  ('com-1','00000000-0000-0000-0000-000000000002','Carlos Eduardo Santos','ord-1','PED-2025-0412','Agropecuária Santa Fé Ltda','cli-1',16410.25,3.5,574.36,'paga','2025-04','2025-05-05','2025-04-16'),
  ('com-2','00000000-0000-0000-0000-000000000002','Carlos Eduardo Santos','ord-2','PED-2025-0387','Cooperativa Agro Vale Verde','cli-3',94312.00,2.5,2357.80,'aprovada','2025-05',null,'2025-05-02'),
  ('com-3','00000000-0000-0000-0000-000000000002','Carlos Eduardo Santos','ord-3','PED-2025-0401','Fazenda Boa Esperança','cli-2',3853.50,3.5,134.87,'prevista','2025-05',null,'2025-05-08'),
  ('com-4','00000000-0000-0000-0000-000000000003','Ana Paula Ferreira','ord-5','PED-2025-0421','Agropecuária Cerrado Sul','cli-6',44354.50,3.0,1330.64,'aprovada','2025-05',null,'2025-04-29'),
  ('com-5','00000000-0000-0000-0000-000000000005','Fernanda Lima Souza','ord-4','PED-2025-0415','Fazenda Planalto Verde','cli-9',164910.00,2.8,4617.48,'aprovada','2025-05',null,'2025-05-01')
on conflict (id) do nothing;

-- BLING SYNCS
insert into public.bling_syncs (id,entity,status,total,synced,errors,last_sync,next_sync,error_message) values
  ('sync-1','produtos','sincronizado',12,12,0,'2025-05-10T06:00:00','2025-05-10T18:00:00',null),
  ('sync-2','clientes','sincronizado',10,10,0,'2025-05-10T06:00:00','2025-05-10T18:00:00',null),
  ('sync-3','pedidos','erro',6,4,2,'2025-05-09T22:00:00',null,'Timeout na conexão com API Bling (503). Pedidos ord-3 e ord-6 pendentes.'),
  ('sync-4','estoque','sincronizado',12,12,0,'2025-05-10T06:00:00','2025-05-10T18:00:00',null),
  ('sync-5','tabelas','pendente',3,0,0,null,'2025-05-10T20:00:00',null)
on conflict (entity) do nothing;

-- INTERAÇÕES
insert into public.interactions (id,client_id,client_name,rep_id,rep_name,type,title,description,rating,related_id,timestamp) values
  ('int-1','cli-1','Agropecuária Santa Fé Ltda','00000000-0000-0000-0000-000000000002','Carlos Eduardo Santos','checkin','Check-in realizado','Visita iniciada ao cliente',null,null,'2025-04-28T09:00:00'),
  ('int-2','cli-1','Agropecuária Santa Fé Ltda','00000000-0000-0000-0000-000000000002','Carlos Eduardo Santos','checkout','Check-out realizado','Visita muito positiva! Cliente interessado em novos defensivos.',5,null,'2025-04-28T10:30:00'),
  ('int-3','cli-1','Agropecuária Santa Fé Ltda','00000000-0000-0000-0000-000000000002','Carlos Eduardo Santos','pedido','Pedido criado','Pedido PED-2025-0412 no valor de R$ 16.410,25',null,'ord-1','2025-04-15T09:30:00'),
  ('int-4','cli-1','Agropecuária Santa Fé Ltda','00000000-0000-0000-0000-000000000002','Carlos Eduardo Santos','rota','Adicionado à rota','Cliente incluído na rota do dia',null,null,'2025-04-28T07:00:00'),
  ('int-5','cli-2','Fazenda Boa Esperança','00000000-0000-0000-0000-000000000002','Carlos Eduardo Santos','checkin','Check-in realizado','Visita iniciada ao cliente',null,null,'2025-05-05T08:00:00'),
  ('int-6','cli-2','Fazenda Boa Esperança','00000000-0000-0000-0000-000000000002','Carlos Eduardo Santos','checkout','Check-out realizado','Cliente aberto a novas propostas de defensivos veterinários.',4,null,'2025-05-05T09:15:00'),
  ('int-7','cli-2','Fazenda Boa Esperança','00000000-0000-0000-0000-000000000002','Carlos Eduardo Santos','pedido','Pedido criado','Pedido PED-2025-0401 no valor de R$ 3.853,50',null,'ord-3','2025-05-08T14:20:00'),
  ('int-8','cli-3','Cooperativa Agro Vale Verde','00000000-0000-0000-0000-000000000002','Carlos Eduardo Santos','pedido','Pedido criado','Pedido PED-2025-0387 no valor de R$ 94.312,00',null,'ord-2','2025-05-01T11:00:00'),
  ('int-9','cli-9','Fazenda Planalto Verde','00000000-0000-0000-0000-000000000005','Fernanda Lima Souza','pedido','Pedido criado','Pedido PED-2025-0415 no valor de R$ 164.910,00',null,'ord-4','2025-04-30T10:00:00'),
  ('int-10','cli-6','Agropecuária Cerrado Sul','00000000-0000-0000-0000-000000000003','Ana Paula Ferreira','checkin','Check-in realizado','Visita iniciada ao cliente',null,null,'2025-04-25T09:00:00'),
  ('int-11','cli-6','Agropecuária Cerrado Sul','00000000-0000-0000-0000-000000000003','Ana Paula Ferreira','checkout','Check-out realizado','Excelente reunião, fechamos grande pedido de fungicidas.',5,null,'2025-04-25T11:30:00')
on conflict (id) do nothing;

-- AUDIT LOGS
insert into public.audit_logs (id,user_id,user_name,user_role,action,entity,entity_id,description,ip,timestamp) values
  ('log-1','00000000-0000-0000-0000-000000000002','Carlos Eduardo Santos','rep','checkin','Visita','vis-1','Check-in na Agropecuária Santa Fé Ltda',null,'2025-04-28T09:15:23'),
  ('log-2','00000000-0000-0000-0000-000000000002','Carlos Eduardo Santos','rep','create_order','Pedido','ord-1','Criou pedido PED-2025-0412 — R$ 16.410,25',null,'2025-04-28T11:20:00'),
  ('log-3','00000000-0000-0000-0000-000000000002','Carlos Eduardo Santos','rep','checkout','Visita','vis-1','Check-out na Agropecuária Santa Fé Ltda',null,'2025-04-28T11:30:14'),
  ('log-4','00000000-0000-0000-0000-000000000001','Marina Julia de Souza','admin','sync_bling','Bling','ord-1','Pedido PED-2025-0412 sincronizado com Bling',null,'2025-04-28T14:02:35'),
  ('log-5','00000000-0000-0000-0000-000000000003','Ana Paula Ferreira','rep','login','Sistema','rep-2','Login realizado','177.20.135.42','2025-05-03T08:47:00'),
  ('log-6','00000000-0000-0000-0000-000000000003','Ana Paula Ferreira','rep','checkin','Visita','vis-4','Check-in na Agropecuária Cerrado Sul',null,'2025-05-03T09:02:17'),
  ('log-7','00000000-0000-0000-0000-000000000002','Carlos Eduardo Santos','rep','assume_prospect','Prospect','pro-2','Assumiu prospect Agropecuária Irmãos Mendes',null,'2025-05-01T10:15:00'),
  ('log-8','00000000-0000-0000-0000-000000000001','Marina Julia de Souza','admin','transfer_client','Cliente','cli-4','Transferiu Distribuidora Campos Verdes de rep-2 para rep-1',null,'2025-04-30T16:20:00'),
  ('log-9','00000000-0000-0000-0000-000000000005','Fernanda Lima Souza','rep','create_order','Pedido','ord-4','Criou pedido PED-2025-0415 — R$ 164.910,00',null,'2025-04-30T10:12:00'),
  ('log-10','00000000-0000-0000-0000-000000000002','Carlos Eduardo Santos','rep','login','Sistema','rep-1','Login realizado','189.40.112.88','2025-05-08T07:55:00')
on conflict (id) do nothing;

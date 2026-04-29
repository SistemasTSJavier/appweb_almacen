import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppLayout } from "./layout";
import { RequireRole, RequireSession } from "./guards";
import { LoginPage } from "../modules/login-page";
import { DashboardPage } from "../modules/dashboard-page";
import { InventoryPage } from "../modules/inventory-page";
import { OperationsPage } from "../modules/operations-page";
import { CollaboratorsPage } from "../modules/collaborators-page";
import { OrdersPage } from "../modules/orders-page";
import { CyclicPage } from "../modules/cyclic-page";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <RequireSession />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: "/", element: <Navigate to="/inventario" replace /> },
          {
            element: <RequireRole allowed={["admin"]} />,
            children: [{ path: "/dashboard", element: <DashboardPage /> }],
          },
          { path: "/inventario", element: <InventoryPage /> },
          { path: "/operaciones", element: <OperationsPage /> },
          { path: "/colaboradores", element: <CollaboratorsPage /> },
          {
            element: <RequireRole allowed={["admin", "operaciones", "almacen_cedis", "almacen_acuna", "almacen_nld"]} />,
            children: [{ path: "/pedidos", element: <OrdersPage /> }],
          },
          { path: "/conteo-ciclico", element: <CyclicPage /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/login" replace /> },
]);

# Bitácora: instalación a mano en un VPS

Registro de la primera instalación de Melend/OS en un VPS real, hecha a mano siguiendo `docs/instalacion-vps.md`. De aquí salen el instalador y el asistente de alta: cada paso que funcione se convierte en un paso del instalador, y cada error, en una comprobación previa o en un arreglo automático.

## Datos de la prueba

| Qué                   | Valor                                        |
| --------------------- | -------------------------------------------- |
| Fecha                 | _pendiente_                                  |
| Proveedor y ubicación | _pendiente_                                  |
| Tamaño                | _pendiente_ (objetivo: 4 vCPU, 8 GB, 160 GB) |
| Sistema               | Ubuntu 24.04 LTS                             |
| Nombres               | _pendiente_ (panel, reservas, api)           |
| Versión de Melend/OS  | _commit de `main`_                           |
| Versiones de Supabase | _las del `docker-compose` usado_             |

Ninguna contraseña, clave ni IP privada se apunta aquí: solo dónde está cada una.

## Pasos

Una entrada por paso, en orden:

```
### N. Título
- Órdenes: lo que se ejecutó (sin secretos).
- Tiempo: cuánto tardó.
- Resultado: bien / error.
- Error: mensaje y causa (si lo hubo).
- Arreglo: qué se hizo; si cambia código, el PR.
- Para el instalador: qué hay que automatizar o comprobar antes.
```

_Sin entradas todavía._

## Errores encontrados

| #   | Paso | Error | Causa | Arreglo | Instalador |
| --- | ---- | ----- | ----- | ------- | ---------- |

## Medidas

| Qué                    | En reposo | Con uso |
| ---------------------- | --------- | ------- |
| RAM                    |           |         |
| CPU                    |           |         |
| Disco (sistema/copias) |           |         |
| Respuesta de la API    |           |         |

## Conclusiones para el instalador

_Pendiente de la prueba._

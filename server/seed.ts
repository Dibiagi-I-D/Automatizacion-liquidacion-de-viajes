import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function seed() {
  console.log('🌱 Creando datos de ejemplo...')

  // Crear un chofer de ejemplo
  const chofer = await prisma.chofer.upsert({
    where: { legajo: '12345' },
    update: {},
    create: {
      legajo: '12345',
      interno: 'INT-001',
    },
  })

  console.log('✅ Chofer creado:', chofer)
  console.log('\n📋 Credenciales para login:')
  console.log('   Legajo: 12345')
  console.log('   Interno: INT-001')
  console.log('\n🌱 Seed completado')
}

seed()
  .catch((e) => {
    console.error('❌ Error en seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

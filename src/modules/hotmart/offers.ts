import { prisma } from '../../db/prisma.js';
import type { HotmartOfferType } from '@prisma/client';

export function listHotmartOffers(locationId: string) {
  return prisma.hotmartOffer.findMany({ where: { locationId }, orderBy: { createdAt: 'asc' } });
}

export function createHotmartOffer(locationId: string, input: { name: string; hotmartProductName: string; offerType: HotmartOfferType }) {
  return prisma.hotmartOffer.create({
    data: { locationId, name: input.name, hotmartProductName: input.hotmartProductName, offerType: input.offerType },
  });
}

export async function deleteHotmartOffer(locationId: string, offerId: string) {
  const offer = await prisma.hotmartOffer.findFirst({ where: { id: offerId, locationId } });
  if (!offer) return false;
  await prisma.hotmartOffer.delete({ where: { id: offerId } });
  return true;
}

<?php
/**
 * Copyright (C) 2011-2020 Wikimedia Foundation and others.
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with this program; if not, write to the Free Software Foundation, Inc.,
 * 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
 */

use MediaWiki\MediaWikiServices;
use MWParsoid\Config\DataAccess as MWDataAccess;
use MWParsoid\Config\PageConfigFactory as MWPageConfigFactory;
use MWParsoid\Config\SiteConfig as MWSiteConfig;
use Wikimedia\Parsoid\Config\Api\DataAccess as ApiDataAccess;
use Wikimedia\Parsoid\Config\Api\SiteConfig as ApiSiteConfig;
use Wikimedia\Parsoid\Config\DataAccess;
use Wikimedia\Parsoid\Config\SiteConfig;

return [

	'ParsoidSiteConfig' => function ( MediaWikiServices $services ): SiteConfig {
		$mainConfig = $services->getMainConfig();
		$parsoidSettings = $mainConfig->get( 'ParsoidSettings' );
		if ( !empty( $parsoidSettings['debugApi'] ) ) {
			return ApiSiteConfig::fromSettings( $parsoidSettings );
		}
		return new MWSiteConfig( $mainConfig, $parsoidSettings, $services->getContentLanguage() );
	},

	'ParsoidPageConfigFactory' => function ( MediaWikiServices $services ): MWPageConfigFactory {
		return new MWPageConfigFactory( $services->getRevisionStore(),
			$services->getSlotRoleRegistry() );
	},

	'ParsoidDataAccess' => function ( MediaWikiServices $services ): DataAccess {
		$parsoidSettings = $services->getMainConfig()->get( 'ParsoidSettings' );
		if ( !empty( $parsoidSettings['debugApi'] ) ) {
			return ApiDataAccess::fromSettings( $parsoidSettings );
		}
		return new MWDataAccess(
			$services->getRepoGroup(),
			$services->getBadFileLookup(),
			$services->getParserFactory() // *legacy* parser factory
		);
	},
];

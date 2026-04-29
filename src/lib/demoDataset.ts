export type DemoImageRef = {
  src: string;
  title: string;
  author: string;
  license: string;
  source: string;
};

export type DemoDataset = {
  labelKey: "demo_class_cats" | "demo_class_dogs";
  training: DemoImageRef[];
  tests: DemoImageRef[];
};

export const demoDatasets: DemoDataset[] = [
  {
    labelKey: "demo_class_cats",
    training: [
      {
        src: "/datasets/cats/cat-01.jpg",
        title: "Six weeks old cat (aka).jpg",
        author: "André Karwath aka Aka",
        license: "CC BY-SA 2.5",
        source: "https://commons.wikimedia.org/wiki/File:Six_weeks_old_cat_(aka).jpg"
      },
      {
        src: "/datasets/cats/cat-02.jpg",
        title: "Felis catus-cat on snow.jpg",
        author: "Von.grzanka",
        license: "CC BY-SA 3.0",
        source: "https://commons.wikimedia.org/wiki/File:Felis_catus-cat_on_snow.jpg"
      },
      {
        src: "/datasets/cats/cat-03.jpg",
        title: "Cat November 2010-1a.jpg",
        author: "Alvesgaspar",
        license: "CC BY-SA 3.0",
        source: "https://commons.wikimedia.org/wiki/File:Cat_November_2010-1a.jpg"
      },
      {
        src: "/datasets/cats/cat-04.jpg",
        title: "June odd-eyed-cat cropped.jpg",
        author: "Keith Kissel",
        license: "CC BY 2.0",
        source: "https://commons.wikimedia.org/wiki/File:June_odd-eyed-cat_cropped.jpg"
      },
      {
        src: "/datasets/cats/cat-05.jpg",
        title: "Tabby cat with blue eyes-3336579.jpg",
        author: "AdinaVoicu",
        license: "CC0",
        source: "https://commons.wikimedia.org/wiki/File:Tabby_cat_with_blue_eyes-3336579.jpg"
      },
      {
        src: "/datasets/cats/cat-06.jpg",
        title: "Golden tabby and white kitten n01.jpg",
        author: "Marie-Lan Nguyen",
        license: "CC BY 2.5",
        source: "https://commons.wikimedia.org/wiki/File:Golden_tabby_and_white_kitten_n01.jpg"
      },
      {
        src: "/datasets/cats/cat-07.jpg",
        title: "Muso di gatto europeo.JPG",
        author: "Dario Crespi",
        license: "CC BY-SA 4.0",
        source: "https://commons.wikimedia.org/wiki/File:Muso_di_gatto_europeo.JPG"
      },
      {
        src: "/datasets/cats/cat-08.jpg",
        title: "Gato (2) REFON.jpg",
        author: "José Reynaldo da Fonseca",
        license: "CC BY 2.5",
        source: "https://commons.wikimedia.org/wiki/File:Gato_(2)_REFON.jpg"
      },
      {
        src: "/datasets/cats/cat-09.jpg",
        title: "Kittyply edit1.jpg",
        author: "David Corby, edited by Arad",
        license: "CC BY 2.5",
        source: "https://commons.wikimedia.org/wiki/File:Kittyply_edit1.jpg"
      },
      {
        src: "/datasets/cats/cat-10.jpg",
        title: "Chartreux-cat-edouard-marie.jpg",
        author: "Stephanemartin",
        license: "CC BY-SA 3.0",
        source: "https://commons.wikimedia.org/wiki/File:Chartreux-cat-edouard-marie.jpg"
      }
    ],
    tests: [
      {
        src: "/datasets/cats/cat-test-01.jpg",
        title: "Felis silvestris catus lying on rice straw.jpg",
        author: "Basile Morin",
        license: "CC BY-SA 4.0",
        source: "https://commons.wikimedia.org/wiki/File:Felis_silvestris_catus_lying_on_rice_straw.jpg"
      },
      {
        src: "/datasets/cats/cat-test-02.jpg",
        title: "Cat in Piran, Slovenia, 20240504 1600 8594.jpg",
        author: "Jakub Hałun",
        license: "CC BY 4.0",
        source: "https://commons.wikimedia.org/wiki/File:Cat_in_Piran%2C_Slovenia%2C_20240504_1600_8594.jpg"
      },
      {
        src: "/datasets/cats/cat-test-03.jpg",
        title: "Cholula, Mexico (Unsplash).jpg",
        author: "Luis Mézquita lemepe",
        license: "CC0",
        source: "https://commons.wikimedia.org/wiki/File:Cholula%2C_Mexico_(Unsplash).jpg"
      },
      {
        src: "/datasets/cats/cat-test-04.jpg",
        title: "Kucing Putih Oren.jpg",
        author: "Cendy00",
        license: "CC BY 4.0",
        source: "https://commons.wikimedia.org/wiki/File:Kucing_Putih_Oren.jpg"
      },
      {
        src: "/datasets/cats/cat-test-05.jpg",
        title: "Joey, meu gato.jpg",
        author: "Nicolas Bazzei",
        license: "CC BY-SA 4.0",
        source: "https://commons.wikimedia.org/wiki/File:Joey%2C_meu_gato.jpg"
      },
      {
        src: "/datasets/cats/cat-test-06.jpg",
        title: "Kitten of the Saptagiri-Dronagiri.jpg",
        author: "Sandrasingh1",
        license: "CC BY-SA 4.0",
        source: "https://commons.wikimedia.org/wiki/File:Kitten_of_the_Saptagiri-Dronagiri.jpg"
      },
      {
        src: "/datasets/cats/cat-test-07.jpg",
        title: "Bicolour kitten - 5.5 months old.jpg",
        author: "Fluqxlexy",
        license: "CC BY 4.0",
        source: "https://commons.wikimedia.org/wiki/File:Bicolour_kitten_-_5.5_months_old.jpg"
      },
      {
        src: "/datasets/cats/cat-test-08.jpg",
        title: "Yellow-eyed resting tuxedo cat.jpg",
        author: "Fabio Pani",
        license: "CC BY-SA 4.0",
        source: "https://commons.wikimedia.org/wiki/File:Yellow-eyed_resting_tuxedo_cat.jpg"
      },
      {
        src: "/datasets/cats/cat-test-09.jpg",
        title: "Cat sleeping in the Ngọc Sơn Temple in Hanoi, 20240204 1309 5747.jpg",
        author: "Jakub Hałun",
        license: "CC BY 4.0",
        source: "https://commons.wikimedia.org/wiki/File:Cat_sleeping_in_the_Ng%E1%BB%8Dc_S%C6%A1n_Temple_in_Hanoi%2C_20240204_1309_5747.jpg"
      },
      {
        src: "/datasets/cats/cat-test-10.jpg",
        title: "Domestic short-haired tabby cat.jpg",
        author: "Ghost of a cat",
        license: "CC BY-SA 4.0",
        source: "https://commons.wikimedia.org/wiki/File:Domestic_short-haired_tabby_cat.jpg"
      }
    ]
  },
  {
    labelKey: "demo_class_dogs",
    training: [
      {
        src: "/datasets/dogs/dog-01.jpg",
        title: "Alaskan Malamute R Bartz.jpg",
        author: "Richard Bartz",
        license: "CC BY-SA 2.5",
        source: "https://commons.wikimedia.org/wiki/File:Alaskan_Malamute_R_Bartz.jpg"
      },
      {
        src: "/datasets/dogs/dog-02.jpg",
        title: "Callie the golden retriever puppy.jpg",
        author: "MichaelMcPhee",
        license: "CC BY 3.0",
        source: "https://commons.wikimedia.org/wiki/File:Callie_the_golden_retriever_puppy.jpg"
      },
      {
        src: "/datasets/dogs/dog-03.jpg",
        title: "20110425 German Shepherd Dog 8505.jpg",
        author: "Jakub Hałun",
        license: "CC BY-SA 4.0",
        source: "https://commons.wikimedia.org/wiki/File:20110425_German_Shepherd_Dog_8505.jpg"
      },
      {
        src: "/datasets/dogs/dog-04.jpg",
        title: "Border-Collie-tri-colour-face-1.jpg",
        author: "Kreuzschnabel",
        license: "CC BY-SA 3.0",
        source: "https://commons.wikimedia.org/wiki/File:Border-Collie-tri-colour-face-1.jpg"
      },
      {
        src: "/datasets/dogs/dog-05.jpg",
        title: "Bronco the Beagle.JPG",
        author: "PumpkinSky",
        license: "CC BY-SA 4.0",
        source: "https://commons.wikimedia.org/wiki/File:Bronco_the_Beagle.JPG"
      },
      {
        src: "/datasets/dogs/dog-06.jpg",
        title: "Beagle in Viroinval (DSC04556).jpg",
        author: "Trougnouf (Benoit Brummer)",
        license: "CC BY 4.0",
        source: "https://commons.wikimedia.org/wiki/File:Beagle_in_Viroinval_(DSC04556).jpg"
      },
      {
        src: "/datasets/dogs/dog-07.jpg",
        title: "Airedale terrier head, Josselin 01.jpg",
        author: "Amélie Tsaag Valren",
        license: "CC BY-SA 4.0",
        source: "https://commons.wikimedia.org/wiki/File:Airedale_terrier_head%2C_Josselin_01.jpg"
      },
      {
        src: "/datasets/dogs/dog-08.jpg",
        title: "Chihuahua qui profite du soleil.jpg",
        author: "JackyM59",
        license: "CC BY-SA 4.0",
        source: "https://commons.wikimedia.org/wiki/File:Chihuahua_qui_profite_du_soleil.jpg"
      },
      {
        src: "/datasets/dogs/dog-09.jpg",
        title: "Fawn and white Welsh Corgi puppy standing on rear legs and sticking out the tongue.jpg",
        author: "Huoadg5888, minor edits by Subsidiary account",
        license: "CC0",
        source: "https://commons.wikimedia.org/wiki/File:Fawn_and_white_Welsh_Corgi_puppy_standing_on_rear_legs_and_sticking_out_the_tongue.jpg"
      },
      {
        src: "/datasets/dogs/dog-10.jpg",
        title: "Sara - Perro Pastor 01.jpg",
        author: "Basotxerri",
        license: "CC BY-SA 4.0",
        source: "https://commons.wikimedia.org/wiki/File:Sara_-_Perro_Pastor_01.jpg"
      }
    ],
    tests: [
      {
        src: "/datasets/dogs/dog-test-01.jpg",
        title: "Toy Poodle wearing clothes in Tokyo.jpg",
        author: "Basile Morin",
        license: "CC BY-SA 4.0",
        source: "https://commons.wikimedia.org/wiki/File:Toy_Poodle_wearing_clothes_in_Tokyo.jpg"
      },
      {
        src: "/datasets/dogs/dog-test-02.jpg",
        title: "Liver yellow dog in the water looking at viewer at golden hour in Don Det Laos.jpg",
        author: "Basile Morin",
        license: "CC BY-SA 4.0",
        source: "https://commons.wikimedia.org/wiki/File:Liver_yellow_dog_in_the_water_looking_at_viewer_at_golden_hour_in_Don_Det_Laos.jpg"
      },
      {
        src: "/datasets/dogs/dog-test-03.jpg",
        title: "2021-07-10-vanino-dog-with-diverse-eyes-7182.jpg",
        author: "I13Robin",
        license: "CC BY 4.0",
        source: "https://commons.wikimedia.org/wiki/File:2021-07-10-vanino-dog-with-diverse-eyes-7182.jpg"
      },
      {
        src: "/datasets/dogs/dog-test-04.jpg",
        title: "A havanese dog in Finland.jpg",
        author: "ThePointyHatGnome",
        license: "CC0",
        source: "https://commons.wikimedia.org/wiki/File:A_havanese_dog_in_Finland.jpg"
      },
      {
        src: "/datasets/dogs/dog-test-05.jpg",
        title: "A happy dog in Namsai, Arunachal Pradesh.jpg",
        author: "JyotiPN",
        license: "CC BY-SA 4.0",
        source: "https://commons.wikimedia.org/wiki/File:A_happy_dog_in_Namsai%2C_Arunachal_Pradesh.jpg"
      },
      {
        src: "/datasets/dogs/dog-test-06.jpg",
        title: "A black dog with expressive eyes sits quietly, looking directly at the camera.jpg",
        author: "Shixart1985",
        license: "CC BY 2.0",
        source: "https://commons.wikimedia.org/wiki/File:A_black_dog_with_expressive_eyes_sits_quietly%2C_looking_directly_at_the_camera.jpg"
      },
      {
        src: "/datasets/dogs/dog-test-07.jpg",
        title: "Animal, Dog, Frenchie Chuchu black doggy 2025.jpg",
        author: "Gerardolagunes",
        license: "CC0",
        source: "https://commons.wikimedia.org/wiki/File:Animal%2C_Dog%2C_Frenchie_Chuchu_black_doggy_2025.jpg"
      },
      {
        src: "/datasets/dogs/dog-test-08.jpg",
        title: "2008-07-11 White German Shepherd pup chilling at the Coker Arboretum.jpg",
        author: "Ildar Sagdejev (Specious)",
        license: "CC BY-SA 4.0",
        source: "https://commons.wikimedia.org/wiki/File:2008-07-11_White_German_Shepherd_pup_chilling_at_the_Coker_Arboretum.jpg"
      },
      {
        src: "/datasets/dogs/dog-test-09.jpg",
        title: "2008-08-28 White German Shepherd ready.jpg",
        author: "Ildar Sagdejev (Specious)",
        license: "CC BY-SA 4.0",
        source: "https://commons.wikimedia.org/wiki/File:2008-08-28_White_German_Shepherd_ready.jpg"
      },
      {
        src: "/datasets/dogs/dog-test-10.jpg",
        title: "Two puppies playing together one standing over the other at golden hour in Don Det Laos.jpg",
        author: "Basile Morin",
        license: "CC BY-SA 4.0",
        source: "https://commons.wikimedia.org/wiki/File:Two_puppies_playing_together_one_standing_over_the_other_at_golden_hour_in_Don_Det_Laos.jpg"
      }
    ]
  }
];

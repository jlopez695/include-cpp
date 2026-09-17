#ifndef UTILITIES_HPP
#define UTILITIES_HPP

#include <vector>

#include "person.hpp"

const Person& FindPersonById(const std::vector<Person>& people, unsigned int id);

#endif
